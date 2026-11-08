//! `verafy_judiciary`: the judiciary signer (VIP-0010). A Squads v4 member
//! that no person holds a key for. It approves or rejects a proposal only when
//! a sealed `verafy_ruling` ruling says so, and that ruling must bind to the
//! exact transaction bytes, come from exactly the jury the signer was set up
//! with, clear the signer's bar, and have outlived its challenge window.
//!
//! The policy and the models are fixed when the signer is attached and never
//! change: a new policy is a new signer, swapped in by a Squads config change
//! that the old signer must approve.
//!
//! Instructions (tag byte first):
//! - `0 attach`   [signer config (w, owned, created by the client at CONFIG_SIZE), creator (signer)]
//!                data: bar_ppm u32, multisig[32], policy_hash[32], models_hash[32],
//!                      ruling_program[32], challenge_slots u64, escape_slots u64, n u8, n juror keys[32]
//! - `1 register` [config, case (w, PDA ["case", config, proposal]), multisig, proposal, transaction,
//!                 payer (signer, w), system program]   data: rent u64, fee u64
//!                Opens a case for one proposal and fixes the transaction it will act on.
//!                The fee is the jury's pay (VIP-0012), held in the case account.
//! - `2 decide`   [config, case (w), ruling, multisig, proposal (w), transaction, authority (w, PDA ["authority", config]), squads]
//!                Votes as the ruling says: answer 0 approves, answer 1 rejects.
//! - `3 escape`   [config, case (w), multisig, proposal (w), authority (w), squads]
//!                If the signer allows an escape hatch and the case has waited `escape_slots`
//!                with no decision, approve, so a dead jury cannot trap funds. A rejected
//!                case can never escape.
//! - `4 pay`      [config, case (w), ruling, the ruling's juror keys (w), in seat order]
//!                After a decision, split the fee equally among the jurors the ruling records
//!                as revealed. Jurors who never revealed get nothing; their share stays in
//!                the case. Once only.
//!
//! The case hash every ruling must carry as its contract hash:
//!   sha256("verafy-judiciary/1" || config || proposal || sha256(transaction account data))
//!
//! Config layout: 0 magic "VRFYJUD1"  8 status  9 n  10 pad[2]  12 bar_ppm u32  16 multisig[32]
//!   48 policy_hash[32]  80 models_hash[32]  112 ruling_program[32]  144 creator[32]
//!   176 challenge_slots u64  184 escape_slots u64  192 jurors[8][32]  -> 448
//! Case layout: 0 magic "VRFYCAS1"  8 status  9 paid  16 config[32]  48 proposal[32]  80 tx_hash[32]
//!   112 case_hash[32]  144 registered_slot u64  152 decided_slot u64  160 fee u64  -> 176
#![cfg_attr(target_os = "solana", no_std)]

use abi::cpi::{find_program_address, invoke_signed, Arg};
use abi::{err, Input, Reader};

pub const CONFIG_MAGIC: &[u8; 8] = b"VRFYJUD1";
pub const CASE_MAGIC: &[u8; 8] = b"VRFYCAS1";
pub const CONFIG_SIZE: usize = 448;
pub const CASE_SIZE: usize = 176;
pub const MAX_JURORS: usize = 8;
pub const CASE_PREFIX: &[u8] = b"verafy-judiciary/1";

pub const ATTACHED: u8 = 1;
pub const REGISTERED: u8 = 1;
pub const APPROVED: u8 = 2;
pub const REJECTED: u8 = 3;
pub const ESCAPED: u8 = 4;

/// The Squads v4 program.
pub const SQUADS: [u8; 32] = [
    0x06, 0x81, 0xc4, 0xce, 0x47, 0xe2, 0x23, 0x68, 0xb8, 0xb1, 0x55, 0x5e, 0xc8, 0x87, 0xaf, 0x09,
    0x2e, 0xfc, 0x7e, 0xfb, 0xb6, 0x6c, 0xa3, 0xf5, 0x2f, 0xbf, 0x68, 0xd4, 0xac, 0x9c, 0xb7, 0xa8,
];
const SYSTEM: [u8; 32] = [0; 32];

// verafy_ruling layout (packages/solana/program).
const R_MAGIC: &[u8; 8] = b"VRFYRUL1";
const R_SEALED: u8 = 2;
const R_JUROR_AT: usize = 80;
const R_JUROR_SIZE: usize = 104;
const R_RELEASE_AT: usize = 1434;
const R_WINDOW_AT: usize = 1442;
const R_SIZE: usize = 1450;

/// The account is not in the state this instruction needs.
pub const WRONG_STATE: u64 = 100;
/// An account is not the one the signer or the case names.
pub const WRONG_ACCOUNT: u64 = 101;
/// The ruling is not a sealed ruling by this signer's jury on this case.
pub const BAD_RULING: u64 = 102;
/// The challenge window or the escape delay has not passed.
pub const TOO_EARLY: u64 = 103;
/// The transaction changed since the case was registered.
pub const CHANGED: u64 = 104;

fn u64_at(s: &[u8], at: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&s[at..at + 8]);
    u64::from_le_bytes(b)
}
fn u32_at(s: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([s[at], s[at + 1], s[at + 2], s[at + 3]])
}
fn key_at(s: &[u8], at: usize) -> [u8; 32] {
    let mut k = [0u8; 32];
    k.copy_from_slice(&s[at..at + 32]);
    k
}

#[cfg(target_os = "solana")]
fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    extern "C" {
        fn sol_sha256(vals: *const u8, val_len: u64, hash_result: *mut u8) -> u64;
    }
    let mut out = [0u8; 32];
    unsafe { sol_sha256(parts.as_ptr() as *const u8, parts.len() as u64, out.as_mut_ptr()) };
    out
}
#[cfg(not(target_os = "solana"))]
fn sha256(_parts: &[&[u8]]) -> [u8; 32] {
    [0u8; 32]
}

#[cfg(target_os = "solana")]
fn slot() -> u64 {
    extern "C" {
        fn sol_get_clock_sysvar(addr: *mut u8) -> u64;
    }
    let mut clock = [0u8; 40];
    unsafe { sol_get_clock_sysvar(clock.as_mut_ptr()) };
    u64_at(&clock, 0)
}
#[cfg(not(target_os = "solana"))]
fn slot() -> u64 {
    0
}

/// The case hash a ruling must carry.
pub fn case_hash(config: &[u8; 32], proposal: &[u8; 32], tx_hash: &[u8; 32]) -> [u8; 32] {
    sha256(&[CASE_PREFIX, config, proposal, tx_hash])
}

/// Squads accounts this program reads: owner checked, multisig and index matched.
/// Proposal: 8 disc, multisig 8..40, transaction_index 40..48.
/// Vault and config transactions: 8 disc, multisig 8..40, creator 40..72, index 72..80.
fn check_squads(multisig_owner: &[u8; 32], multisig: &[u8; 32], proposal_owner: &[u8; 32], proposal: &[u8], tx_owner: &[u8; 32], tx: &[u8]) -> Result<(), u64> {
    if multisig_owner != &SQUADS || proposal_owner != &SQUADS || tx_owner != &SQUADS {
        return Err(WRONG_ACCOUNT);
    }
    if proposal.len() < 48 || tx.len() < 80 {
        return Err(WRONG_ACCOUNT);
    }
    if &proposal[8..40] != multisig || &tx[8..40] != multisig || proposal[40..48] != tx[72..80] {
        return Err(WRONG_ACCOUNT);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn vote(name: &[u8], config_key: &[u8; 32], authority: &[u8; 32], program_id: &[u8; 32], squads: abi::Raw, multisig: abi::Raw, authority_raw: abi::Raw, proposal: abi::Raw) -> Result<(), u64> {
    let (expected, bump) = find_program_address(&[b"authority", config_key], program_id)?;
    if &expected != authority {
        return Err(WRONG_ACCOUNT);
    }
    // Anchor: sha256("global:proposal_approve" | "global:proposal_reject")[..8], then memo: None.
    let d = sha256(&[b"global:", name]);
    let data = [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], 0];
    let accounts = [
        Arg { raw: multisig, writable: false, signer: false },
        Arg { raw: authority_raw, writable: true, signer: true },
        Arg { raw: proposal, writable: true, signer: false },
    ];
    invoke_signed(&SQUADS, squads, &accounts, &data, &[b"authority", config_key, &[bump]])
}

/// An account's key, owner, flags and call pointers, copied out so its data
/// can be taken separately.
struct Meta {
    key: [u8; 32],
    owner: [u8; 32],
    signer: bool,
    writable: bool,
    raw: abi::Raw,
}

fn meta(ix: &Input, i: usize) -> Result<Meta, u64> {
    let a = ix.accounts.get(i).and_then(|a| a.as_ref()).ok_or(err::BAD_ACCOUNTS)?;
    Ok(Meta { key: *a.key, owner: *a.owner, signer: a.is_signer, writable: a.is_writable, raw: a.raw })
}

pub fn process(ix: &mut Input) -> Result<(), u64> {
    let mut r = Reader::new(ix.data);
    let program_id = *ix.program_id;
    match r.u8()? {
        0 => {
            ix.expect(2)?;
            let creator = ix.accounts[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
            if !creator.is_signer {
                return Err(err::BAD_ACCOUNTS);
            }
            let creator_key = *creator.key;
            let bar = r.u32()?;
            let multisig = r.key()?;
            let policy = r.key()?;
            let models = r.key()?;
            let ruling_program = r.key()?;
            let challenge = r.u64()?;
            let escape = r.u64()?;
            let n = r.u8()? as usize;
            if n == 0 || n > MAX_JURORS || bar == 0 || bar > 1_000_000 {
                return Err(err::OUT_OF_BOUNDS);
            }
            // A jury of one is trusted, so it must leave time to challenge it (VIP-0008).
            if n == 1 && challenge == 0 {
                return Err(err::OUT_OF_BOUNDS);
            }
            // An escape hatch must be slower than any ruling could be.
            if escape != 0 && escape <= challenge {
                return Err(err::OUT_OF_BOUNDS);
            }
            let mut jurors = [[0u8; 32]; MAX_JURORS];
            for j in jurors.iter_mut().take(n) {
                *j = r.key()?;
            }
            r.end()?;
            for i in 0..n {
                for k in (i + 1)..n {
                    if jurors[i] == jurors[k] {
                        return Err(err::BAD_INPUT);
                    }
                }
            }
            let c = ix.take_owned(0)?;
            if c.len() < CONFIG_SIZE {
                return Err(err::SMALL_ACCOUNT);
            }
            if c[8] != 0 {
                return Err(WRONG_STATE);
            }
            c[0..8].copy_from_slice(CONFIG_MAGIC);
            c[8] = ATTACHED;
            c[9] = n as u8;
            c[12..16].copy_from_slice(&bar.to_le_bytes());
            c[16..48].copy_from_slice(&multisig);
            c[48..80].copy_from_slice(&policy);
            c[80..112].copy_from_slice(&models);
            c[112..144].copy_from_slice(&ruling_program);
            c[144..176].copy_from_slice(&creator_key);
            c[176..184].copy_from_slice(&challenge.to_le_bytes());
            c[184..192].copy_from_slice(&escape.to_le_bytes());
            for (i, j) in jurors.iter().enumerate().take(n) {
                c[192 + 32 * i..224 + 32 * i].copy_from_slice(j);
            }
            Ok(())
        }
        1 => {
            ix.expect(7)?;
            let rent = r.u64()?;
            let fee = r.u64()?;
            let lamports = rent.checked_add(fee).ok_or(err::OVERFLOW)?;
            r.end()?;
            let (config_m, case_m, ms_m, prop_m, tx_m, payer_m, sys_m) = (meta(ix, 0)?, meta(ix, 1)?, meta(ix, 2)?, meta(ix, 3)?, meta(ix, 4)?, meta(ix, 5)?, meta(ix, 6)?);
            let config = ix.take_read(0)?;
            let proposal = ix.take_read(3)?;
            let tx = ix.take_read(4)?;
            if config_m.owner != program_id || config.len() < CONFIG_SIZE || &config[0..8] != CONFIG_MAGIC || config[8] != ATTACHED {
                return Err(WRONG_STATE);
            }
            if config[16..48] != ms_m.key[..] || sys_m.key != SYSTEM || !payer_m.signer || !payer_m.writable || !case_m.writable {
                return Err(WRONG_ACCOUNT);
            }
            check_squads(&ms_m.owner, &ms_m.key, &prop_m.owner, proposal, &tx_m.owner, tx)?;
            let (case_key, bump) = find_program_address(&[b"case", &config_m.key, &prop_m.key], &program_id)?;
            if case_key != case_m.key {
                return Err(WRONG_ACCOUNT);
            }
            let tx_hash = sha256(&[tx]);
            let hash = case_hash(&config_m.key, &prop_m.key, &tx_hash);
            // system_program::create_account(payer, case, lamports, CASE_SIZE, this program), signed by the case address.
            let mut data = [0u8; 52];
            data[4..12].copy_from_slice(&lamports.to_le_bytes());
            data[12..20].copy_from_slice(&(CASE_SIZE as u64).to_le_bytes());
            data[20..52].copy_from_slice(&program_id);
            let accounts = [Arg { raw: payer_m.raw, writable: true, signer: true }, Arg { raw: case_m.raw, writable: true, signer: true }];
            invoke_signed(&SYSTEM, sys_m.raw, &accounts, &data, &[b"case", &config_m.key, &prop_m.key, &[bump]])?;
            // The account now exists, owned by this program, with CASE_SIZE bytes where its data was.
            if case_m.raw.data.is_null() {
                return Err(err::BAD_ACCOUNTS);
            }
            let case = unsafe { core::slice::from_raw_parts_mut(case_m.raw.data, CASE_SIZE) };
            case[0..8].copy_from_slice(CASE_MAGIC);
            case[8] = REGISTERED;
            case[16..48].copy_from_slice(&config_m.key);
            case[48..80].copy_from_slice(&prop_m.key);
            case[80..112].copy_from_slice(&tx_hash);
            case[112..144].copy_from_slice(&hash);
            case[144..152].copy_from_slice(&slot().to_le_bytes());
            case[160..168].copy_from_slice(&fee.to_le_bytes());
            Ok(())
        }
        2 => {
            ix.expect(8)?;
            r.end()?;
            let (config_m, _case_m, ruling_m, ms_m, prop_m, tx_m, auth_m, sq_m) = (meta(ix, 0)?, meta(ix, 1)?, meta(ix, 2)?, meta(ix, 3)?, meta(ix, 4)?, meta(ix, 5)?, meta(ix, 6)?, meta(ix, 7)?);
            let config = ix.take_read(0)?;
            let ruling = ix.take_read(2)?;
            let proposal = ix.take_read(4)?;
            let tx = ix.take_read(5)?;
            if config_m.owner != program_id || config.len() < CONFIG_SIZE || &config[0..8] != CONFIG_MAGIC || config[8] != ATTACHED {
                return Err(WRONG_STATE);
            }
            if config[16..48] != ms_m.key[..] || sq_m.key != SQUADS {
                return Err(WRONG_ACCOUNT);
            }
            check_squads(&ms_m.owner, &ms_m.key, &prop_m.owner, proposal, &tx_m.owner, tx)?;
            let tx_hash = sha256(&[tx]);
            // The ruling: sealed, by this signer's ruling program, by exactly this jury, past its challenge window.
            if ruling_m.owner[..] != config[112..144] || ruling.len() < R_SIZE || &ruling[0..8] != R_MAGIC || ruling[8] != R_SEALED {
                return Err(BAD_RULING);
            }
            let n = config[9] as usize;
            if ruling[9] as usize != n || u32_at(ruling, 12) < u32_at(config, 12) {
                return Err(BAD_RULING);
            }
            for i in 0..n {
                let k = key_at(ruling, R_JUROR_AT + R_JUROR_SIZE * i);
                if !(0..n).any(|j| config[192 + 32 * j..224 + 32 * j] == k[..]) {
                    return Err(BAD_RULING);
                }
            }
            let answer = ruling[10];
            let ruled_on = key_at(ruling, 16);
            let case = ix.take_owned(1)?;
            if case.len() < CASE_SIZE || &case[0..8] != CASE_MAGIC || case[8] != REGISTERED || case[16..48] != config_m.key[..] || case[48..80] != prop_m.key[..] {
                return Err(WRONG_STATE);
            }
            if case[80..112] != tx_hash[..] {
                return Err(CHANGED);
            }
            if case[112..144] != ruled_on[..] {
                return Err(BAD_RULING);
            }
            // Last: the ruling must have outlived its challenge window, and that window must be the signer's or longer.
            if (u32_at(ruling, R_WINDOW_AT) as u64) < u64_at(config, 176) || slot() < u64_at(ruling, R_RELEASE_AT) {
                return Err(TOO_EARLY);
            }
            let (name, status): (&[u8], u8) = match answer {
                0 => (b"proposal_approve", APPROVED),
                1 => (b"proposal_reject", REJECTED),
                _ => return Err(BAD_RULING),
            };
            case[8] = status;
            case[152..160].copy_from_slice(&slot().to_le_bytes());
            vote(name, &config_m.key, &auth_m.key, &program_id, sq_m.raw, ms_m.raw, auth_m.raw, prop_m.raw)
        }
        3 => {
            ix.expect(6)?;
            r.end()?;
            let (config_m, _case_m, ms_m, prop_m, auth_m, sq_m) = (meta(ix, 0)?, meta(ix, 1)?, meta(ix, 2)?, meta(ix, 3)?, meta(ix, 4)?, meta(ix, 5)?);
            let config = ix.take_read(0)?;
            let proposal = ix.take_read(3)?;
            if config_m.owner != program_id || config.len() < CONFIG_SIZE || &config[0..8] != CONFIG_MAGIC || config[8] != ATTACHED {
                return Err(WRONG_STATE);
            }
            if config[16..48] != ms_m.key[..] || sq_m.key != SQUADS || ms_m.owner != SQUADS || prop_m.owner != SQUADS || proposal.len() < 48 || proposal[8..40] != ms_m.key[..] {
                return Err(WRONG_ACCOUNT);
            }
            let escape = u64_at(config, 184);
            let case = ix.take_owned(1)?;
            if escape == 0 || case.len() < CASE_SIZE || &case[0..8] != CASE_MAGIC || case[8] != REGISTERED || case[16..48] != config_m.key[..] || case[48..80] != prop_m.key[..] {
                return Err(WRONG_STATE);
            }
            let now = slot();
            if now < u64_at(case, 144).checked_add(escape).ok_or(err::OVERFLOW)? {
                return Err(TOO_EARLY);
            }
            case[8] = ESCAPED;
            case[152..160].copy_from_slice(&now.to_le_bytes());
            vote(b"proposal_approve", &config_m.key, &auth_m.key, &program_id, sq_m.raw, ms_m.raw, auth_m.raw, prop_m.raw)
        }
        4 => {
            r.end()?;
            let config_m = meta(ix, 0)?;
            let case_m = meta(ix, 1)?;
            let ruling_m = meta(ix, 2)?;
            let config = ix.take_read(0)?;
            let ruling = ix.take_read(2)?;
            if config_m.owner != program_id || config.len() < CONFIG_SIZE || &config[0..8] != CONFIG_MAGIC || config[8] != ATTACHED {
                return Err(WRONG_STATE);
            }
            if ruling_m.owner[..] != config[112..144] || ruling.len() < R_SIZE || &ruling[0..8] != R_MAGIC || ruling[8] != R_SEALED {
                return Err(BAD_RULING);
            }
            let n = ruling[9] as usize;
            ix.expect(3 + n)?;
            let mut revealed = [false; MAX_JURORS];
            let mut count = 0u64;
            for i in 0..n {
                let k = key_at(ruling, R_JUROR_AT + R_JUROR_SIZE * i);
                let m = meta(ix, 3 + i)?;
                if m.key != k || !m.writable {
                    return Err(WRONG_ACCOUNT);
                }
                if !(0..config[9] as usize).any(|j| config[192 + 32 * j..224 + 32 * j] == k[..]) {
                    return Err(BAD_RULING);
                }
                if ruling[R_JUROR_AT + R_JUROR_SIZE * i + 97] == 2 {
                    revealed[i] = true;
                    count += 1;
                }
            }
            let ruled_on = key_at(ruling, 16);
            let case = ix.take_owned(1)?;
            if case.len() < CASE_SIZE || &case[0..8] != CASE_MAGIC || case[16..48] != config_m.key[..] || case[112..144] != ruled_on[..] {
                return Err(WRONG_STATE);
            }
            if !(case[8] == APPROVED || case[8] == REJECTED) || case[9] != 0 {
                return Err(WRONG_STATE);
            }
            case[9] = 1;
            let fee = u64_at(case, 160);
            if count == 0 || fee == 0 {
                return Ok(());
            }
            let share = fee / count;
            // The case account is this program's, so it can be debited directly; any account can be credited.
            unsafe {
                *case_m.raw.lamports = (*case_m.raw.lamports).checked_sub(share * count).ok_or(err::OVERFLOW)?;
                for (i, r) in revealed.iter().enumerate().take(n) {
                    if *r {
                        let j = meta(ix, 3 + i)?;
                        *j.raw.lamports = (*j.raw.lamports).checked_add(share).ok_or(err::OVERFLOW)?;
                    }
                }
            }
            Ok(())
        }
        _ => Err(err::BAD_INPUT),
    }
}

abi::entrypoint!(process);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn squads_id_matches_its_base58() {
        // SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
        assert_eq!(SQUADS[0], 0x06);
        assert_eq!(CONFIG_SIZE, 192 + 32 * MAX_JURORS);
    }

    #[test]
    fn squads_accounts_must_agree() {
        let ms = [7u8; 32];
        let mut p = [0u8; 48];
        p[8..40].copy_from_slice(&ms);
        p[40] = 5;
        let mut t = [0u8; 80];
        t[8..40].copy_from_slice(&ms);
        t[72] = 5;
        assert!(check_squads(&SQUADS, &ms, &SQUADS, &p, &SQUADS, &t).is_ok());
        t[72] = 6;
        assert_eq!(check_squads(&SQUADS, &ms, &SQUADS, &p, &SQUADS, &t), Err(WRONG_ACCOUNT));
        t[72] = 5;
        assert_eq!(check_squads(&SQUADS, &ms, &[1u8; 32], &p, &SQUADS, &t), Err(WRONG_ACCOUNT));
    }
}
