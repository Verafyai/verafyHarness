//! `verafy_registry` (VIP-0012): harnesses register on chain so anyone can find
//! them with one `getProgramAccounts` call and pay them. One account per
//! harness, at the program address ["harness", harness key].
//!
//! The bond is the SOL the account holds above rent. Anyone adds to it with a
//! plain system transfer. The operator takes it out only after retiring and
//! waiting `UNBOND_SLOTS`, so a harness cannot pull its bond the moment it
//! misbehaves.
//!
//! Instructions (tag byte first):
//! - `0 register` [harness account (w, PDA), harness key (signer), operator (signer, w, pays), system program]
//!                data: lamports u64 (rent plus any opening bond), family[32], model[64],
//!                      model_commitment[32], endpoint[128], price u64, attestation_hash[32]
//!                The harness key signs, proving the operator controls the key that will vote.
//! - `1 update`   [harness account (w), operator (signer)]  data: endpoint[128], price u64, attestation_hash[32]
//!                The model cannot change: a new model is a new harness.
//! - `2 retire`   [harness account (w), operator (signer)]  stops new draws.
//! - `3 withdraw` [harness account (w), operator (signer, w)]  data: lamports u64
//!                Only once retired for UNBOND_SLOTS. Taking everything closes the account.
//!
//! Layout: 0 magic "VRFYHRN1"  8 status (1 active, 2 retired)  16 harness_key[32]  48 operator[32]
//!   80 family[32]  112 model[64]  176 model_commitment[32]  208 endpoint[128]  336 price u64
//!   344 attestation_hash[32]  376 registered_slot u64  384 retired_slot u64  -> 392
#![cfg_attr(target_os = "solana", no_std)]

use abi::cpi::{find_program_address, invoke_signed, Arg};
use abi::{err, Input, Reader};

pub const MAGIC: &[u8; 8] = b"VRFYHRN1";
pub const HARNESS_SIZE: usize = 392;
pub const ACTIVE: u8 = 1;
pub const RETIRED: u8 = 2;
/// About two epochs at 400 ms slots (modeled). Illustrative until Rex sets it.
pub const UNBOND_SLOTS: u64 = 864_000;
const SYSTEM: [u8; 32] = [0; 32];

/// The account is not in the state this instruction needs.
pub const WRONG_STATE: u64 = 100;
/// The signer is not the harness key or its operator.
pub const NOT_AUTHORIZED: u64 = 101;
/// The unbonding delay has not passed.
pub const TOO_EARLY: u64 = 103;

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

pub fn process(ix: &mut Input) -> Result<(), u64> {
    let mut r = Reader::new(ix.data);
    let program_id = *ix.program_id;
    match r.u8()? {
        0 => {
            ix.expect(4)?;
            let lamports = r.u64()?;
            let family = r.bytes(32)?;
            let model = r.bytes(64)?;
            let commitment = r.bytes(32)?;
            let endpoint = r.bytes(128)?;
            let price = r.u64()?;
            let attestation = r.bytes(32)?;
            r.end()?;
            let a = &ix.accounts;
            let (acc, key, op, sys) = (a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[2].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[3].as_ref().ok_or(err::BAD_ACCOUNTS)?);
            if !key.is_signer || !op.is_signer || !op.is_writable || !acc.is_writable || sys.key != &SYSTEM {
                return Err(NOT_AUTHORIZED);
            }
            let harness_key = *key.key;
            let operator = *op.key;
            let (pda, bump) = find_program_address(&[b"harness", &harness_key], &program_id)?;
            if &pda != acc.key {
                return Err(err::BAD_ACCOUNTS);
            }
            let mut data = [0u8; 52];
            data[4..12].copy_from_slice(&lamports.to_le_bytes());
            data[12..20].copy_from_slice(&(HARNESS_SIZE as u64).to_le_bytes());
            data[20..52].copy_from_slice(&program_id);
            let (acc_raw, op_raw, sys_raw) = (acc.raw, op.raw, sys.raw);
            invoke_signed(&SYSTEM, sys_raw, &[Arg { raw: op_raw, writable: true, signer: true }, Arg { raw: acc_raw, writable: true, signer: true }], &data, &[b"harness", &harness_key, &[bump]])?;
            if acc_raw.data.is_null() {
                return Err(err::BAD_ACCOUNTS);
            }
            let s = unsafe { core::slice::from_raw_parts_mut(acc_raw.data, HARNESS_SIZE) };
            s[0..8].copy_from_slice(MAGIC);
            s[8] = ACTIVE;
            s[16..48].copy_from_slice(&harness_key);
            s[48..80].copy_from_slice(&operator);
            s[80..112].copy_from_slice(family);
            s[112..176].copy_from_slice(model);
            s[176..208].copy_from_slice(commitment);
            s[208..336].copy_from_slice(endpoint);
            s[336..344].copy_from_slice(&price.to_le_bytes());
            s[344..376].copy_from_slice(attestation);
            s[376..384].copy_from_slice(&slot().to_le_bytes());
            Ok(())
        }
        1 | 2 => {
            let tag = ix.data[0];
            ix.expect(2)?;
            let op = ix.accounts[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
            let (op_key, op_signer) = (*op.key, op.is_signer);
            let update = if tag == 1 { Some((r.bytes(128)?, r.u64()?, r.bytes(32)?)) } else { None };
            r.end()?;
            let s = ix.take_owned(0)?;
            if s.len() < HARNESS_SIZE || &s[0..8] != MAGIC || s[8] != ACTIVE {
                return Err(WRONG_STATE);
            }
            if !op_signer || s[48..80] != op_key[..] {
                return Err(NOT_AUTHORIZED);
            }
            match update {
                Some((endpoint, price, attestation)) => {
                    s[208..336].copy_from_slice(endpoint);
                    s[336..344].copy_from_slice(&price.to_le_bytes());
                    s[344..376].copy_from_slice(attestation);
                }
                None => {
                    s[8] = RETIRED;
                    s[384..392].copy_from_slice(&slot().to_le_bytes());
                }
            }
            Ok(())
        }
        3 => {
            ix.expect(2)?;
            let amount = r.u64()?;
            r.end()?;
            let (acc_raw, op_raw, op_key, op_signer, op_writable) = {
                let a = &ix.accounts;
                let acc = a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                let op = a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?;
                (acc.raw, op.raw, *op.key, op.is_signer, op.is_writable)
            };
            let s = ix.take_owned(0)?;
            if s.len() < HARNESS_SIZE || &s[0..8] != MAGIC || s[8] != RETIRED {
                return Err(WRONG_STATE);
            }
            if !op_signer || !op_writable || s[48..80] != op_key[..] {
                return Err(NOT_AUTHORIZED);
            }
            if slot() < u64_at(s, 384).checked_add(UNBOND_SLOTS).ok_or(err::OVERFLOW)? {
                return Err(TOO_EARLY);
            }
            unsafe {
                let have = *acc_raw.lamports;
                if amount > have {
                    return Err(err::OUT_OF_BOUNDS);
                }
                *acc_raw.lamports = have - amount;
                *op_raw.lamports = (*op_raw.lamports).checked_add(amount).ok_or(err::OVERFLOW)?;
                if amount == have {
                    for b in s.iter_mut() {
                        *b = 0;
                    }
                }
            }
            Ok(())
        }
        _ => Err(err::BAD_INPUT),
    }
}

abi::entrypoint!(process);
