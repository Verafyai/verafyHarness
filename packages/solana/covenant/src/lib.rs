//! `verafy_covenant` (VIP-0016): a validator bonds a promise not to raise its
//! commission above a maximum until an end slot. The check is code, because a
//! vote account's commission is on chain: if it goes over the maximum before
//! the end slot, anyone can call `claim`, and the bond goes to the
//! beneficiary named at open (a stake pool's reserve, or a distribution
//! account for stakers). Promises code cannot see, such as MEV commission or
//! notice periods, belong to a jury: the `commission-covenant` policy on a
//! bond wallet with a Judiciary Signer.
//!
//! Instructions (tag byte first):
//! - `0 open`    [covenant (w, owned, created by the client with rent plus the bond), withdrawer (signer), vote account]
//!               data: max_commission u8 (percent), end_slot u64, bond u64, beneficiary[32]
//!               The account's lamports beyond `bond` are its rent, kept so a broken covenant stays readable.
//!               Only the vote account's authorized withdrawer can promise for it, and
//!               the commission must already be at or under the maximum.
//! - `1 claim`   [covenant (w), vote account, beneficiary (w)]  anyone; pays the bond out if broken.
//! - `2 release` [covenant (w), withdrawer (signer, w)]  after the end slot, if unbroken: the bond comes back.
//!
//! Vote accounts are read for VoteStateV4 (tag 3: commission in basis points at 132,
//! rounded up to whole percent) and the two older layouts that keep `commission` as a u8 after the
//! node and withdrawer keys (versions 1 and 2, tags 1 and 2): tag at 0, node key at 4,
//! withdrawer at 36, commission at 68. Other layouts are refused rather than guessed.
//!
//! Layout: 0 magic "VRFYCOV1"  8 status (1 active, 2 broken, 3 released)  9 max_commission
//!   16 vote[32]  48 withdrawer[32]  80 beneficiary[32]  112 end_slot u64  120 opened_slot u64  128 rent u64  -> 136
#![cfg_attr(target_os = "solana", no_std)]

use abi::{err, Input, Reader};

pub const MAGIC: &[u8; 8] = b"VRFYCOV1";
pub const COVENANT_SIZE: usize = 136;
pub const ACTIVE: u8 = 1;
pub const BROKEN: u8 = 2;
pub const RELEASED: u8 = 3;
/// Vote111111111111111111111111111111111111111
pub const VOTE_PROGRAM: [u8; 32] = [
    0x07, 0x61, 0x48, 0x1d, 0x35, 0x74, 0x74, 0xbb, 0x7c, 0x4d, 0x76, 0x24, 0xeb, 0xd3, 0xbd, 0xb3,
    0xd8, 0x35, 0x5e, 0x73, 0xd1, 0x10, 0x43, 0xfc, 0x0d, 0xa3, 0x53, 0x80, 0x00, 0x00, 0x00, 0x00,
];

pub const WRONG_STATE: u64 = 100;
pub const NOT_AUTHORIZED: u64 = 101;
/// The vote account is not one this program can read.
pub const BAD_VOTE: u64 = 102;
pub const TOO_EARLY: u64 = 103;
/// The promise holds: the commission is at or under the maximum.
pub const NOT_BROKEN: u64 = 105;

#[cfg(target_os = "solana")]
fn slot() -> u64 {
    extern "C" {
        fn sol_get_clock_sysvar(addr: *mut u8) -> u64;
    }
    let mut clock = [0u8; 40];
    unsafe { sol_get_clock_sysvar(clock.as_mut_ptr()) };
    u64::from_le_bytes([clock[0], clock[1], clock[2], clock[3], clock[4], clock[5], clock[6], clock[7]])
}
#[cfg(not(target_os = "solana"))]
fn slot() -> u64 {
    0
}

fn u64_at(s: &[u8], at: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&s[at..at + 8]);
    u64::from_le_bytes(b)
}

/// (withdrawer, commission) from a vote account, for the layouts this program reads.
pub fn read_vote(owner: &[u8; 32], data: &[u8]) -> Result<([u8; 32], u8), u64> {
    if owner != &VOTE_PROGRAM || data.len() < 69 {
        return Err(BAD_VOTE);
    }
    let tag = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let mut w = [0u8; 32];
    w.copy_from_slice(&data[36..68]);
    match tag {
        1 | 2 => Ok((w, data[68])),
        // VoteStateV4 (SIMD-0185, live on devnet with Agave 4.4): the inflation-rewards
        // commission is basis points at 132. Round up, so 5.01% breaks a 5% promise.
        3 if data.len() >= 136 => {
            let bps = u16::from_le_bytes([data[132], data[133]]) as u32;
            Ok((w, ((bps + 99) / 100).min(255) as u8))
        }
        _ => Err(BAD_VOTE),
    }
}

pub fn process(ix: &mut Input) -> Result<(), u64> {
    let mut r = Reader::new(ix.data);
    match r.u8()? {
        0 => {
            ix.expect(3)?;
            let max = r.u8()?;
            let end = r.u64()?;
            let bond = r.u64()?;
            let beneficiary = r.key()?;
            r.end()?;
            let (w_key, w_signer, vote_key, vote_owner, c_raw) = {
                let a = &ix.accounts;
                let w = a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let v = a[2].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let c = a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                (*w.key, w.is_signer, *v.key, *v.owner, c.raw)
            };
            let have = unsafe { *c_raw.lamports };
            if bond == 0 || bond > have {
                return Err(err::OUT_OF_BOUNDS);
            }
            let vote = ix.take_read(2)?;
            let (withdrawer, commission) = read_vote(&vote_owner, vote)?;
            if !w_signer || w_key != withdrawer {
                return Err(NOT_AUTHORIZED);
            }
            if max > 100 || commission > max || end <= slot() {
                return Err(err::OUT_OF_BOUNDS);
            }
            let c = ix.take_owned(0)?;
            if c.len() < COVENANT_SIZE || c[8] != 0 {
                return Err(WRONG_STATE);
            }
            c[0..8].copy_from_slice(MAGIC);
            c[8] = ACTIVE;
            c[9] = max;
            c[16..48].copy_from_slice(&vote_key);
            c[48..80].copy_from_slice(&withdrawer);
            c[80..112].copy_from_slice(&beneficiary);
            c[112..120].copy_from_slice(&end.to_le_bytes());
            c[120..128].copy_from_slice(&slot().to_le_bytes());
            c[128..136].copy_from_slice(&(have - bond).to_le_bytes());
            Ok(())
        }
        1 => {
            ix.expect(3)?;
            r.end()?;
            let (c_raw, vote_key, vote_owner, b_key, b_raw, b_writable) = {
                let a = &ix.accounts;
                let c = a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let v = a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let b = a[2].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                (c.raw, *v.key, *v.owner, *b.key, b.raw, b.is_writable)
            };
            let vote = ix.take_read(1)?;
            let (_, commission) = read_vote(&vote_owner, vote)?;
            let c = ix.take_owned(0)?;
            if c.len() < COVENANT_SIZE || &c[0..8] != MAGIC || c[8] != ACTIVE || c[16..48] != vote_key[..] || c[80..112] != b_key[..] || !b_writable {
                return Err(WRONG_STATE);
            }
            if slot() >= u64_at(c, 112) {
                return Err(WRONG_STATE);
            }
            if commission <= c[9] {
                return Err(NOT_BROKEN);
            }
            c[8] = BROKEN;
            // Keep the rent, so the broken covenant stays on chain as a record; pay out the rest.
            let keep = u64_at(c, 128);
            unsafe {
                let have = *c_raw.lamports;
                let pay = have.saturating_sub(keep);
                *c_raw.lamports = have - pay;
                *b_raw.lamports = (*b_raw.lamports).checked_add(pay).ok_or(err::OVERFLOW)?;
            }
            Ok(())
        }
        2 => {
            ix.expect(2)?;
            r.end()?;
            let (c_raw, w_key, w_signer, w_writable, w_raw) = {
                let a = &ix.accounts;
                let c = a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let w = a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                (c.raw, *w.key, w.is_signer, w.is_writable, w.raw)
            };
            let c = ix.take_owned(0)?;
            if c.len() < COVENANT_SIZE || &c[0..8] != MAGIC || c[8] != ACTIVE {
                return Err(WRONG_STATE);
            }
            if !w_signer || !w_writable || c[48..80] != w_key[..] {
                return Err(NOT_AUTHORIZED);
            }
            if slot() < u64_at(c, 112) {
                return Err(TOO_EARLY);
            }
            for b in c.iter_mut() {
                *b = 0;
            }
            unsafe {
                let have = *c_raw.lamports;
                *c_raw.lamports = 0;
                *w_raw.lamports = (*w_raw.lamports).checked_add(have).ok_or(err::OVERFLOW)?;
            }
            Ok(())
        }
        _ => Err(err::BAD_INPUT),
    }
}

abi::entrypoint!(process);
