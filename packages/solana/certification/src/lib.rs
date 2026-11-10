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
//! Every verdict is also kept as its own record at
//! ["verdict", program, bytecode_hash, seq u32 LE], numbered from 0. Records are
//! never rewritten except for one field: when a newer verdict lands for the same
//! build, the previous record's `superseded_by` is set to the new record. So a
//! client holding an old receipt follows `superseded_by` to the current verdict,
//! and a current verdict walks `supersedes` back through every earlier one. The
//! account at ["cert", ...] stays the one place to read the latest verdict, and
//! counts the records.
//!
//! Instructions (tag byte first):
//! - `0` is the version 1 certify. It is retired, because it rewrote the
//!   verdict without keeping a record; it fails with USE_V2.
//! - `1 certify` [cert (w, PDA), ruling, payer (signer, w), system program,
//!                 record (w, PDA, the next seq), previous record (w; when there
//!                 is none, this program's own address, since accounts may not repeat), then one registry account per
//!                 seated juror, in seat order]
//!   data: program[32], bytecode_hash[32], report_hash[32], score u8
//!   Creates the account, or replaces it with a ruling that becomes releasable
//!   later, and appends a record that supersedes the previous one.
//! - `2 record` [cert (w), payer (signer, w), system program, record (w, PDA, seq 0)]
//!   For a certification written by version 1, which has no records: copies the
//!   current verdict into record 0. Anyone may call it; it copies only what the
//!   program already checked.
//!
//! Layout of ["cert", ...]: 0 magic "VRFYCRT1"  8 level u8  9 score u8  10 seats u8
//!   11 families u8  12 records u32 (0 for a version 1 certification not yet recorded)
//!   16 program[32]  48 bytecode_hash[32]  80 report_hash[32]  112 ruling[32]
//!   144 certifier[32]  176 releasable_after_slot u64  184 certified_slot u64  -> 192
//! Layout of a record: 0 magic "VRFYVRD1"  8..192 as above, with 12 its own seq u32,
//!   192 supersedes[32] (zero for seq 0)  224 superseded_by[32] (zero while current) -> 256
#![cfg_attr(target_os = "solana", no_std)]

use abi::cpi::{find_program_address, invoke_signed, Arg};
use abi::{err, Input, Reader};

pub const MAGIC: &[u8; 8] = b"VRFYCRT1";
pub const CERT_SIZE: usize = 192;
pub const RECORD_MAGIC: &[u8; 8] = b"VRFYVRD1";
pub const RECORD_SIZE: usize = 256;
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
pub const USE_V2: u64 = 106;
/// A version 1 certification must be recorded (tag 2) before it can be replaced.
pub const NOT_RECORDED: u64 = 107;
pub const ALREADY_RECORDED: u64 = 108;
pub const BAD_RECORD: u64 = 109;
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

fn u32_at(s: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([s[at], s[at + 1], s[at + 2], s[at + 3]])
}

/// Create a program-owned account at a PDA, paid by `payer`.
fn create(program_id: &[u8; 32], sys_raw: abi::Raw, payer_raw: abi::Raw, target_raw: abi::Raw, size: usize, seeds: &[&[u8]]) -> Result<(), u64> {
    let rent = 1_000_000u64 + (size as u64) * 6_960;
    let mut data = [0u8; 52];
    data[4..12].copy_from_slice(&rent.to_le_bytes());
    data[12..20].copy_from_slice(&(size as u64).to_le_bytes());
    data[20..52].copy_from_slice(program_id);
    invoke_signed(&SYSTEM, sys_raw, &[Arg { raw: payer_raw, writable: true, signer: true }, Arg { raw: target_raw, writable: true, signer: true }], &data, seeds)
}

/// The record PDA for one verdict of one build.
fn record_address(program: &[u8; 32], bytecode_hash: &[u8; 32], seq: u32, program_id: &[u8; 32]) -> Result<([u8; 32], u8), u64> {
    find_program_address(&[b"verdict", program, bytecode_hash, &seq.to_le_bytes()], program_id)
}

pub fn process(ix: &mut Input) -> Result<(), u64> {
    let mut r = Reader::new(ix.data);
    let program_id = *ix.program_id;
    match r.u8()? {
        0 => Err(USE_V2),
        1 => certify(ix, r, program_id),
        2 => record_current(ix, r, program_id),
        _ => Err(err::BAD_INPUT),
    }
}

/// Tag 2: copy a version 1 certification's current verdict into record 0.
fn record_current(ix: &mut Input, r: Reader, program_id: [u8; 32]) -> Result<(), u64> {
    r.end()?;
    if ix.count != 4 {
        return Err(err::BAD_ACCOUNTS);
    }
    let a = &ix.accounts;
    let (cert, payer, sys, rec) = (a[0].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[1].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[2].as_ref().ok_or(err::BAD_ACCOUNTS)?, a[3].as_ref().ok_or(err::BAD_ACCOUNTS)?);
    if !payer.is_signer || !payer.is_writable || !cert.is_writable || !rec.is_writable || sys.key != &SYSTEM {
        return Err(NOT_AUTHORIZED);
    }
    if cert.owner != &program_id || cert.data.len() < CERT_SIZE || &cert.data[0..8] != MAGIC {
        return Err(err::BAD_ACCOUNTS);
    }
    if u32_at(cert.data, 12) != 0 {
        return Err(ALREADY_RECORDED);
    }
    let mut program = [0u8; 32];
    let mut bytecode_hash = [0u8; 32];
    program.copy_from_slice(&cert.data[16..48]);
    bytecode_hash.copy_from_slice(&cert.data[48..80]);
    let (pda, _) = find_program_address(&[b"cert", &program, &bytecode_hash], &program_id)?;
    if &pda != cert.key {
        return Err(err::BAD_ACCOUNTS);
    }
    let (rpda, rbump) = record_address(&program, &bytecode_hash, 0, &program_id)?;
    if &rpda != rec.key || rec.owner == &program_id {
        return Err(BAD_RECORD);
    }
    let mut head = [0u8; CERT_SIZE];
    head.copy_from_slice(&cert.data[..CERT_SIZE]);
    let (cert_raw, payer_raw, sys_raw, rec_raw) = (cert.raw, payer.raw, sys.raw, rec.raw);
    create(&program_id, sys_raw, payer_raw, rec_raw, RECORD_SIZE, &[b"verdict", &program, &bytecode_hash, &0u32.to_le_bytes(), &[rbump]])?;
    if rec_raw.data.is_null() || cert_raw.data.is_null() {
        return Err(err::BAD_ACCOUNTS);
    }
    let out = unsafe { core::slice::from_raw_parts_mut(rec_raw.data, RECORD_SIZE) };
    out[..CERT_SIZE].copy_from_slice(&head);
    out[0..8].copy_from_slice(RECORD_MAGIC);
    out[12..16].copy_from_slice(&0u32.to_le_bytes());
    let h = unsafe { core::slice::from_raw_parts_mut(cert_raw.data, CERT_SIZE) };
    h[12..16].copy_from_slice(&1u32.to_le_bytes());
    Ok(())
}

/// Tag 1: certify from a sealed ruling, and keep the verdict as a record.
fn certify(ix: &mut Input, mut r: Reader, program_id: [u8; 32]) -> Result<(), u64> {
    let program = r.key()?;
    let bytecode_hash = r.key()?;
    let report_hash = r.key()?;
    let score = r.u8()?;
    r.end()?;
    if ix.count < 6 + MIN_SEATS {
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
    if seats < MIN_SEATS || ix.count != 6 + seats {
        return Err(BAD_JURY);
    }
    let mut families = [[0u8; 32]; 8];
    let mut n_families = 0usize;
    for i in 0..seats {
        let juror = &ruling.data[R_JUROR + R_JUROR_SIZE * i..R_JUROR + R_JUROR_SIZE * i + 32];
        let h = a[6 + i].as_ref().ok_or(err::BAD_ACCOUNTS)?;
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
    let rec = a[4].as_ref().ok_or(err::BAD_ACCOUNTS)?;
    let prev = a[5].as_ref().ok_or(err::BAD_ACCOUNTS)?;
    if !rec.is_writable {
        return Err(NOT_AUTHORIZED);
    }
    let ruling_key = *ruling.key;
    let certifier = *payer.key;
    let exists = cert.owner == &program_id && cert.data.len() >= CERT_SIZE && &cert.data[0..8] == MAGIC;
    let seq = if exists { u32_at(cert.data, 12) } else { 0 };
    if exists {
        if u64_at(cert.data, 176) >= releasable {
            return Err(NOT_NEWER);
        }
        if seq == 0 {
            return Err(NOT_RECORDED);
        }
    }

    // The new record is the next seq; the previous one, if any, is seq - 1.
    let (rpda, rbump) = record_address(&program, &bytecode_hash, seq, &program_id)?;
    if &rpda != rec.key || rec.owner == &program_id {
        return Err(BAD_RECORD);
    }
    let mut supersedes = [0u8; 32];
    let mut prev_raw = abi::Raw::NONE;
    if seq > 0 {
        let (ppda, _) = record_address(&program, &bytecode_hash, seq - 1, &program_id)?;
        if &ppda != prev.key || prev.owner != &program_id || !prev.is_writable || prev.data.len() < RECORD_SIZE || &prev.data[0..8] != RECORD_MAGIC {
            return Err(BAD_RECORD);
        }
        if prev.data[224..256].iter().any(|b| *b != 0) {
            return Err(BAD_RECORD);
        }
        supersedes = ppda;
        prev_raw = prev.raw;
    } else if prev.key != &program_id {
        return Err(BAD_RECORD);
    }

    let (cert_raw, payer_raw, sys_raw, rec_raw) = (cert.raw, payer.raw, sys.raw, rec.raw);
    if !exists {
        create(&program_id, sys_raw, payer_raw, cert_raw, CERT_SIZE, &[b"cert", &program, &bytecode_hash, &[bump]])?;
    }
    let seq_bytes = seq.to_le_bytes();
    create(&program_id, sys_raw, payer_raw, rec_raw, RECORD_SIZE, &[b"verdict", &program, &bytecode_hash, &seq_bytes, &[rbump]])?;
    if cert_raw.data.is_null() || rec_raw.data.is_null() {
        return Err(err::BAD_ACCOUNTS);
    }
    let now = slot();
    let fill = |s: &mut [u8], magic: &[u8; 8], count: u32| {
        s[0..8].copy_from_slice(magic);
        s[8] = level;
        s[9] = score;
        s[10] = seats as u8;
        s[11] = n_families as u8;
        s[12..16].copy_from_slice(&count.to_le_bytes());
        s[16..48].copy_from_slice(&program);
        s[48..80].copy_from_slice(&bytecode_hash);
        s[80..112].copy_from_slice(&report_hash);
        s[112..144].copy_from_slice(&ruling_key);
        s[144..176].copy_from_slice(&certifier);
        s[176..184].copy_from_slice(&releasable.to_le_bytes());
        s[184..192].copy_from_slice(&now.to_le_bytes());
    };
    let out = unsafe { core::slice::from_raw_parts_mut(rec_raw.data, RECORD_SIZE) };
    fill(out, RECORD_MAGIC, seq);
    out[192..224].copy_from_slice(&supersedes);
    let head = unsafe { core::slice::from_raw_parts_mut(cert_raw.data, CERT_SIZE) };
    fill(head, MAGIC, seq + 1);
    if seq > 0 {
        let p = unsafe { core::slice::from_raw_parts_mut(prev_raw.data, RECORD_SIZE) };
        p[224..256].copy_from_slice(&rpda);
    }
    Ok(())
}

abi::entrypoint!(process);
