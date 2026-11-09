//! `verafy_certification` (VIP-0034): a program's report card, on chain.
//!
//! A certification says: a Verafy jury of registered harnesses read a Fuzzy
//! report for this exact program build and ruled it reached this level. It
//! lives at the program address ["cert", program, bytecode_hash], so an agent
//! that knows a program address hashes the program's current bytecode and
//! reads one account. An upgrade changes the hash, so an old certification
//! never vouches for new code.
//!
//! The program writes nothing it cannot check:
//! - the ruling account is owned by `verafy_ruling` and sealed;
//! - the ruling's contract hash is
//!   sha256("verafy-certification/1" || program || bytecode_hash || report_hash || score),
//!   so the jury ruled on this program, this build and this report;
//! - the level is the jury's answer;
//! - every seated juror is an active `verafy_registry` harness, at least
//!   three seats, from at least two model families.
//!
//! Instructions (tag byte first):
//! - `0 certify` [cert (w, PDA), ruling, payer (signer, w), system program,
//!                 then one registry account per seated juror, in seat order]
//!   data: program[32], bytecode_hash[32], report_hash[32], score u8
//!   Creates the account, or replaces it with a ruling that becomes releasable later.
//!
//! Layout: 0 magic "VRFYCRT1"  8 level u8  9 score u8  10 seats u8  11 families u8 (pad 4)
//!   16 program[32]  48 bytecode_hash[32]  80 report_hash[32]  112 ruling[32]
//!   144 certifier[32]  176 releasable_after_slot u64  184 certified_slot u64  -> 192
#![cfg_attr(target_os = "solana", no_std)]

use abi::cpi::{find_program_address, invoke_signed, Arg};
use abi::{err, Input, Reader};

pub const MAGIC: &[u8; 8] = b"VRFYCRT1";
pub const CERT_SIZE: usize = 192;
pub const DOMAIN: &[u8] = b"verafy-certification/1";

/// verafy_ruling on devnet: A6iZhDZASfQGCmzxXWW8JdnEhtz7EZE3gS4N1hkiJNNN.
pub const RULING_PROGRAM: [u8; 32] = [135, 48, 21, 36, 62, 247, 159, 24, 149, 72, 1, 103, 104, 52, 107, 80, 45, 82, 101, 244, 96, 202, 126, 195, 158, 92, 16, 136, 59, 153, 231, 227];
/// verafy_registry on devnet: Bn6jV1CGK4WFibJcCVsEzHeVVhtph2xPsNkemWfgqn9R.
pub const REGISTRY_PROGRAM: [u8; 32] = [160, 34, 124, 197, 113, 120, 100, 222, 190, 212, 115, 246, 193, 227, 242, 67, 140, 12, 187, 40, 29, 227, 130, 234, 1, 177, 247, 228, 212, 157, 54, 44];
const SYSTEM: [u8; 32] = [0; 32];

// verafy_ruling layout (packages/solana/program).
const R_MAGIC: &[u8; 8] = b"VRFYRUL1";
const R_SEALED: u8 = 2;
const R_JUROR: usize = 80;
const R_JUROR_SIZE: usize = 104;
const R_RELEASABLE: usize = 1434;
const R_SIZE: usize = 1450;
// verafy_registry layout (packages/solana/registry).
const H_MAGIC: &[u8; 8] = b"VRFYHRN1";
const H_ACTIVE: u8 = 1;
const H_SIZE: usize = 392;

pub const NOT_AUTHORIZED: u64 = 100;
pub const BAD_RULING: u64 = 101;
pub const NOT_SEALED: u64 = 102;
pub const WRONG_CONTRACT: u64 = 103;
pub const BAD_JURY: u64 = 104;
pub const NOT_NEWER: u64 = 105;
pub const MIN_SEATS: usize = 3;
pub const MIN_FAMILIES: usize = 2;

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

#[cfg(target_os = "solana")]
fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    #[repr(C)]
    struct Bytes { addr: *const u8, len: u64 }
    extern "C" {
        fn sol_sha256(vals: *const u8, val_len: u64, hash_result: *mut u8) -> u64;
    }
    let mut vals = [Bytes { addr: core::ptr::null(), len: 0 }, Bytes { addr: core::ptr::null(), len: 0 }, Bytes { addr: core::ptr::null(), len: 0 }, Bytes { addr: core::ptr::null(), len: 0 }, Bytes { addr: core::ptr::null(), len: 0 }];
    for (i, p) in parts.iter().enumerate().take(5) {
        vals[i] = Bytes { addr: p.as_ptr(), len: p.len() as u64 };
    }
    let mut out = [0u8; 32];
    unsafe { sol_sha256(vals.as_ptr() as *const u8, parts.len().min(5) as u64, out.as_mut_ptr()) };
    out
}
#[cfg(not(target_os = "solana"))]
fn sha256(_parts: &[&[u8]]) -> [u8; 32] {
    [0; 32]
}

fn u64_at(s: &[u8], at: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&s[at..at + 8]);
    u64::from_le_bytes(b)
}

pub fn process(ix: &mut Input) -> Result<(), u64> {
    let mut r = Reader::new(ix.data);
    let program_id = *ix.program_id;
    if r.u8()? != 0 {
        return Err(err::BAD_INPUT);
    }
    let program = r.key()?;
    let bytecode_hash = r.key()?;
    let report_hash = r.key()?;
    let score = r.u8()?;
    r.end()?;
    if ix.count < 4 + MIN_SEATS {
        return Err(BAD_JURY);
    }
    let a = &ix.accounts;
    let (cert, ruling, payer, sys) = (a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[2].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[3].as_ref().ok_or(err::BAD_ACCOUNTS)?);
    if !payer.is_signer || !payer.is_writable || !cert.is_writable || sys.key != &SYSTEM {
        return Err(NOT_AUTHORIZED);
    }

    // The ruling: sealed, about this program, build and report.
    if ruling.owner != &RULING_PROGRAM || ruling.data.len() < R_SIZE || &ruling.data[0..8] != R_MAGIC {
        return Err(BAD_RULING);
    }
    if ruling.data[8] != R_SEALED {
        return Err(NOT_SEALED);
    }
    let expected = sha256(&[DOMAIN, &program, &bytecode_hash, &report_hash, &[score]]);
    if ruling.data[16..48] != expected {
        return Err(WRONG_CONTRACT);
    }
    let seats = ruling.data[9] as usize;
    let level = ruling.data[10];
    let releasable = u64_at(ruling.data, R_RELEASABLE);

    // The jury: every seat an active registered harness, enough seats and families.
    if seats < MIN_SEATS || ix.count != 4 + seats {
        return Err(BAD_JURY);
    }
    let mut families = [[0u8; 32]; 8];
    let mut n_families = 0usize;
    for i in 0..seats {
        let juror = &ruling.data[R_JUROR + R_JUROR_SIZE * i..R_JUROR + R_JUROR_SIZE * i + 32];
        let h = a[4 + i].as_ref().ok_or(err::BAD_ACCOUNTS)?;
        if h.owner != &REGISTRY_PROGRAM || h.data.len() < H_SIZE || &h.data[0..8] != H_MAGIC || h.data[8] != H_ACTIVE || &h.data[16..48] != juror {
            return Err(BAD_JURY);
        }
        let fam = &h.data[80..112];
        if !families[..n_families].iter().any(|f| f[..] == fam[..]) && n_families < families.len() {
            families[n_families].copy_from_slice(fam);
            n_families += 1;
        }
    }
    if n_families < MIN_FAMILIES {
        return Err(BAD_JURY);
    }

    // The account at ["cert", program, bytecode_hash].
    let (pda, bump) = find_program_address(&[b"cert", &program, &bytecode_hash], &program_id)?;
    if &pda != cert.key {
        return Err(err::BAD_ACCOUNTS);
    }
    let ruling_key = *ruling.key;
    let certifier = *payer.key;
    let (cert_raw, payer_raw, sys_raw) = (cert.raw, payer.raw, sys.raw);
    let exists = cert.owner == &program_id && cert.data.len() >= CERT_SIZE && &cert.data[0..8] == MAGIC;
    if exists {
        if u64_at(cert.data, 176) >= releasable {
            return Err(NOT_NEWER);
        }
    } else {
        let rent = 1_000_000u64 + (CERT_SIZE as u64) * 6_960;
        let mut data = [0u8; 52];
        data[4..12].copy_from_slice(&rent.to_le_bytes());
        data[12..20].copy_from_slice(&(CERT_SIZE as u64).to_le_bytes());
        data[20..52].copy_from_slice(&program_id);
        invoke_signed(&SYSTEM, sys_raw, &[Arg { raw: payer_raw, writable: true, signer: true }, Arg { raw: cert_raw, writable: true, signer: true }], &data, &[b"cert", &program, &bytecode_hash, &[bump]])?;
    }
    if cert_raw.data.is_null() {
        return Err(err::BAD_ACCOUNTS);
    }
    let s = unsafe { core::slice::from_raw_parts_mut(cert_raw.data, CERT_SIZE) };
    s[0..8].copy_from_slice(MAGIC);
    s[8] = level;
    s[9] = score;
    s[10] = seats as u8;
    s[11] = n_families as u8;
    s[16..48].copy_from_slice(&program);
    s[48..80].copy_from_slice(&bytecode_hash);
    s[80..112].copy_from_slice(&report_hash);
    s[112..144].copy_from_slice(&ruling_key);
    s[144..176].copy_from_slice(&certifier);
    s[176..184].copy_from_slice(&releasable.to_le_bytes());
    s[184..192].copy_from_slice(&slot().to_le_bytes());
    Ok(())
}

abi::entrypoint!(process);
