//! The TinySVM program ABI: read the loader's input buffer, read and write
//! little-endian integers, log, and declare an entrypoint. No dependencies, so
//! every byte a program runs is in this repository.
//!
//! Errors are small integers. The runtime reports `Custom(n)`; the JS reference
//! in `packages/core/src/settle.js` returns the same codes, so a rejection is
//! compared across runtimes exactly like a success.
#![cfg_attr(target_os = "solana", no_std)]

/// Errors every TinySVM program shares. Program-specific codes start at 100.
pub mod err {
    /// The instruction data is too short, too long, or has an unknown tag.
    pub const BAD_INPUT: u64 = 1;
    /// The wrong number of accounts, a duplicate, or an account the program cannot write.
    pub const BAD_ACCOUNTS: u64 = 2;
    /// An account's data is too small for what the program must write.
    pub const SMALL_ACCOUNT: u64 = 3;
    /// An arithmetic result does not fit in 64 bits.
    pub const OVERFLOW: u64 = 4;
    /// The result does not conserve totals.
    pub const NOT_CONSERVED: u64 = 5;
    /// A parameter is outside the bounds the program accepts.
    pub const OUT_OF_BOUNDS: u64 = 6;
}

/// The most accounts one TinySVM instruction may take.
pub const MAX_ACCOUNTS: usize = 16;
const NON_DUP_MARKER: u8 = 0xff;
const MAX_PERMITTED_DATA_INCREASE: usize = 10 * 1024;

/// One account the instruction was given.
pub struct Account<'a> {
    pub key: &'a [u8; 32],
    pub owner: &'a [u8; 32],
    pub is_signer: bool,
    pub is_writable: bool,
    pub data: &'a mut [u8],
    /// Where this account's header sits in the loader input, for cross-program calls (see `cpi`).
    pub raw: Raw,
}

/// The pointers a cross-program call needs for one account. Null off chain.
#[derive(Clone, Copy)]
pub struct Raw {
    pub key: *const u8,
    pub lamports: *mut u64,
    pub data_len: u64,
    pub data: *mut u8,
    pub owner: *const u8,
    pub rent_epoch: u64,
    pub is_signer: bool,
    pub is_writable: bool,
    pub executable: bool,
}

impl Raw {
    /// A placeholder for accounts built off chain, in tests.
    pub const NONE: Raw = Raw { key: core::ptr::null(), lamports: core::ptr::null_mut(), data_len: 0, data: core::ptr::null_mut(), owner: core::ptr::null(), rent_epoch: 0, is_signer: false, is_writable: false, executable: false };
}

/// What the loader handed the program.
pub struct Input<'a> {
    pub accounts: [Option<Account<'a>>; MAX_ACCOUNTS],
    pub count: usize,
    pub data: &'a [u8],
    pub program_id: &'a [u8; 32],
}

impl<'a> Input<'a> {
    /// Take the i-th account's data for writing. It must be writable and owned
    /// by this program. Each account can be taken once.
    pub fn take_owned(&mut self, i: usize) -> Result<&'a mut [u8], u64> {
        let pid = self.program_id;
        match self.accounts.get_mut(i).and_then(|a| a.take()) {
            Some(a) if a.is_writable && a.owner == pid => Ok(a.data),
            _ => Err(err::BAD_ACCOUNTS),
        }
    }
    /// Take the i-th account's data, read only. Any owner.
    pub fn take_read(&mut self, i: usize) -> Result<&'a [u8], u64> {
        match self.accounts.get_mut(i).and_then(|a| a.take()) {
            Some(a) => Ok(a.data),
            None => Err(err::BAD_ACCOUNTS),
        }
    }
    /// Refuse an instruction that passed a different number of accounts.
    pub fn expect(&self, n: usize) -> Result<(), u64> {
        if self.count == n { Ok(()) } else { Err(err::BAD_ACCOUNTS) }
    }
}

/// Parse the aligned loader input (BPF loader 2 and the upgradeable loader).
/// Duplicate accounts and more than `MAX_ACCOUNTS` are refused.
///
/// # Safety
/// `input` must be the pointer the loader passed to the entrypoint.
pub unsafe fn deserialize<'a>(input: *mut u8) -> Result<Input<'a>, u64> {
    let mut off: usize = 0;
    let n = read_u64_raw(input, off) as usize;
    off += 8;
    if n > MAX_ACCOUNTS {
        return Err(err::BAD_ACCOUNTS);
    }
    let mut accounts: [Option<Account<'a>>; MAX_ACCOUNTS] = core::array::from_fn(|_| None);
    for slot in accounts.iter_mut().take(n) {
        let dup = *input.add(off);
        if dup != NON_DUP_MARKER {
            return Err(err::BAD_ACCOUNTS);
        }
        let is_signer = *input.add(off + 1) != 0;
        let is_writable = *input.add(off + 2) != 0;
        let executable = *input.add(off + 3) != 0;
        off += 8; // dup, signer, writable, executable, 4 bytes padding
        let key_ptr = input.add(off);
        let key = &*(key_ptr as *const [u8; 32]);
        off += 32;
        let owner_ptr = input.add(off);
        let owner = &*(owner_ptr as *const [u8; 32]);
        off += 32;
        let lamports = input.add(off) as *mut u64; // engine bookkeeping only, never a token balance
        off += 8;
        let len = read_u64_raw(input, off) as usize;
        off += 8;
        let data_ptr = input.add(off);
        let data = core::slice::from_raw_parts_mut(data_ptr, len);
        off += len + MAX_PERMITTED_DATA_INCREASE;
        off += input.add(off).align_offset(8);
        let rent_epoch = read_u64_raw(input, off);
        off += 8;
        let raw = Raw { key: key_ptr, lamports, data_len: len as u64, data: data_ptr, owner: owner_ptr, rent_epoch, is_signer, is_writable, executable };
        *slot = Some(Account { key, owner, is_signer, is_writable, data, raw });
    }
    let dlen = read_u64_raw(input, off) as usize;
    off += 8;
    let data = core::slice::from_raw_parts(input.add(off), dlen);
    off += dlen;
    let program_id = &*(input.add(off) as *const [u8; 32]);
    Ok(Input { accounts, count: n, data, program_id })
}

unsafe fn read_u64_raw(p: *const u8, off: usize) -> u64 {
    let mut b = [0u8; 8];
    core::ptr::copy_nonoverlapping(p.add(off), b.as_mut_ptr(), 8);
    u64::from_le_bytes(b)
}

/// A cursor over instruction data. Every read is bounds checked.
pub struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(buf: &'a [u8]) -> Self {
        Reader { buf, pos: 0 }
    }
    pub fn bytes(&mut self, n: usize) -> Result<&'a [u8], u64> {
        let end = self.pos.checked_add(n).ok_or(err::BAD_INPUT)?;
        if end > self.buf.len() {
            return Err(err::BAD_INPUT);
        }
        let s = &self.buf[self.pos..end];
        self.pos = end;
        Ok(s)
    }
    pub fn u8(&mut self) -> Result<u8, u64> {
        Ok(self.bytes(1)?[0])
    }
    pub fn u32(&mut self) -> Result<u32, u64> {
        let b = self.bytes(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    pub fn u64(&mut self) -> Result<u64, u64> {
        let b = self.bytes(8)?;
        let mut a = [0u8; 8];
        a.copy_from_slice(b);
        Ok(u64::from_le_bytes(a))
    }
    pub fn i64(&mut self) -> Result<i64, u64> {
        Ok(self.u64()? as i64)
    }
    pub fn f64(&mut self) -> Result<f64, u64> {
        Ok(f64::from_bits(self.u64()?))
    }
    pub fn key(&mut self) -> Result<[u8; 32], u64> {
        let b = self.bytes(32)?;
        let mut k = [0u8; 32];
        k.copy_from_slice(b);
        Ok(k)
    }
    /// Refuse trailing bytes, so one encoding means one instruction.
    pub fn end(&self) -> Result<(), u64> {
        if self.pos == self.buf.len() { Ok(()) } else { Err(err::BAD_INPUT) }
    }
}

/// A cursor that writes little-endian values into an account's data.
pub struct Writer<'a> {
    buf: &'a mut [u8],
    pos: usize,
}

impl<'a> Writer<'a> {
    pub fn new(buf: &'a mut [u8]) -> Self {
        Writer { buf, pos: 0 }
    }
    pub fn bytes(&mut self, b: &[u8]) -> Result<(), u64> {
        let end = self.pos.checked_add(b.len()).ok_or(err::SMALL_ACCOUNT)?;
        if end > self.buf.len() {
            return Err(err::SMALL_ACCOUNT);
        }
        self.buf[self.pos..end].copy_from_slice(b);
        self.pos = end;
        Ok(())
    }
    pub fn u32(&mut self, v: u32) -> Result<(), u64> {
        self.bytes(&v.to_le_bytes())
    }
    pub fn u64(&mut self, v: u64) -> Result<(), u64> {
        self.bytes(&v.to_le_bytes())
    }
    pub fn i64(&mut self, v: i64) -> Result<(), u64> {
        self.bytes(&v.to_le_bytes())
    }
    /// Zero the rest of the buffer, so stale bytes never survive a write.
    pub fn finish(self) {
        for b in self.buf[self.pos..].iter_mut() {
            *b = 0;
        }
    }
}

/// A transfer list: the format every exit program writes and the ledger applies.
///
/// `u32 count`, then `count` entries of a 32-byte account key and an i64 delta
/// in the token's base units.
pub const TRANSFER_SIZE: usize = 40;
/// The most entries one transfer list holds.
pub const MAX_TRANSFERS: usize = 16;
/// Bytes a transfer-list account needs.
pub const TRANSFERS_ACCOUNT: usize = 4 + MAX_TRANSFERS * TRANSFER_SIZE;

/// Write a transfer list, checking that it conserves totals.
pub fn write_transfers(buf: &mut [u8], list: &[([u8; 32], i64)]) -> Result<(), u64> {
    if list.len() > MAX_TRANSFERS {
        return Err(err::SMALL_ACCOUNT);
    }
    let mut sum: i128 = 0;
    for (_, d) in list {
        sum += *d as i128;
    }
    if sum != 0 {
        return Err(err::NOT_CONSERVED);
    }
    let mut w = Writer::new(buf);
    w.u32(list.len() as u32)?;
    for (k, d) in list {
        w.bytes(k)?;
        w.i64(*d)?;
    }
    w.finish();
    Ok(())
}

/// Log a message through the runtime (a no-op off chain).
pub fn log(msg: &str) {
    #[cfg(target_os = "solana")]
    unsafe {
        sol_log_(msg.as_ptr(), msg.len() as u64)
    }
    #[cfg(not(target_os = "solana"))]
    let _ = msg;
}

#[cfg(target_os = "solana")]
extern "C" {
    fn sol_log_(message: *const u8, len: u64);
}

/// Declare the program entrypoint and its panic handler. `$process` takes the
/// parsed input and returns `Ok(())` or an error code.
#[macro_export]
macro_rules! entrypoint {
    ($process:path) => {
        #[cfg(target_os = "solana")]
        #[no_mangle]
        pub unsafe extern "C" fn entrypoint(input: *mut u8) -> u64 {
            match $crate::deserialize(input) {
                Ok(mut ix) => match $process(&mut ix) {
                    Ok(()) => 0,
                    Err(e) => e,
                },
                Err(e) => e,
            }
        }

        #[cfg(target_os = "solana")]
        #[panic_handler]
        fn panic(_info: &core::panic::PanicInfo) -> ! {
            $crate::log("panic");
            unsafe { $crate::abort() }
        }
    };
}

/// Stop the program. The runtime turns this into a failed instruction.
///
/// # Safety
/// Never returns.
#[cfg(target_os = "solana")]
pub unsafe fn abort() -> ! {
    extern "C" {
        fn abort() -> !;
    }
    abort()
}

/// Cross-program calls, signed by this program's addresses. On chain these go
/// through `sol_invoke_signed_c`; off chain they are refused, so a program's
/// logic can still be tested natively up to the call.
pub mod cpi {
    use super::Raw;

    #[repr(C)]
    struct AccountInfo { key: *const u8, lamports: *mut u64, data_len: u64, data: *mut u8, owner: *const u8, rent_epoch: u64, is_signer: bool, is_writable: bool, executable: bool }
    #[repr(C)]
    struct Meta { pubkey: *const u8, is_writable: bool, is_signer: bool }
    #[repr(C)]
    struct Instruction { program_id: *const u8, accounts: *const Meta, account_len: u64, data: *const u8, data_len: u64 }
    #[repr(C)]
    struct Bytes { addr: *const u8, len: u64 }

    /// One account in a call: its pointers, and how the callee may use it.
    pub struct Arg { pub raw: Raw, pub writable: bool, pub signer: bool }

    /// The most accounts and seeds one call here passes.
    const MAX: usize = 16;

    /// Call `program` with `accounts` and `data`, signing as the program
    /// address made from `seeds` (bump last). `program_raw` is the callee's
    /// own account, which the runtime needs in the account list.
    pub fn invoke_signed(program: &[u8; 32], program_raw: Raw, accounts: &[Arg], data: &[u8], seeds: &[&[u8]]) -> Result<(), u64> {
        if accounts.len() + 1 > MAX || seeds.len() > MAX {
            return Err(super::err::BAD_ACCOUNTS);
        }
        let mut metas: [Meta; MAX] = core::array::from_fn(|_| Meta { pubkey: core::ptr::null(), is_writable: false, is_signer: false });
        let info = |r: &Raw, w: bool, s: bool| AccountInfo { key: r.key, lamports: r.lamports, data_len: r.data_len, data: r.data, owner: r.owner, rent_epoch: r.rent_epoch, is_signer: s || r.is_signer, is_writable: w && (r.is_writable), executable: r.executable };
        let mut infos: [AccountInfo; MAX] = core::array::from_fn(|_| info(&Raw::NONE, false, false));
        for (i, a) in accounts.iter().enumerate() {
            metas[i] = Meta { pubkey: a.raw.key, is_writable: a.writable, is_signer: a.signer };
            infos[i] = info(&a.raw, a.writable, a.signer);
        }
        infos[accounts.len()] = info(&program_raw, false, false);
        let ix = Instruction { program_id: program.as_ptr(), accounts: metas.as_ptr(), account_len: accounts.len() as u64, data: data.as_ptr(), data_len: data.len() as u64 };
        let mut seed_bytes: [Bytes; MAX] = core::array::from_fn(|_| Bytes { addr: core::ptr::null(), len: 0 });
        for (i, s) in seeds.iter().enumerate() {
            seed_bytes[i] = Bytes { addr: s.as_ptr(), len: s.len() as u64 };
        }
        let signer = Bytes { addr: seed_bytes.as_ptr() as *const u8, len: seeds.len() as u64 };
        #[cfg(target_os = "solana")]
        {
            extern "C" {
                fn sol_invoke_signed_c(ix: *const u8, infos: *const u8, infos_len: u64, seeds: *const u8, seeds_len: u64) -> u64;
            }
            let n_signers = if seeds.is_empty() { 0 } else { 1 };
            let rc = unsafe { sol_invoke_signed_c(&ix as *const Instruction as *const u8, infos.as_ptr() as *const u8, (accounts.len() + 1) as u64, &signer as *const Bytes as *const u8, n_signers) };
            if rc == 0 { Ok(()) } else { Err(rc) }
        }
        #[cfg(not(target_os = "solana"))]
        {
            let _ = (&ix, &infos, &signer);
            Err(super::err::BAD_ACCOUNTS)
        }
    }

    /// Find this program's address for `seeds`, and its bump.
    pub fn find_program_address(seeds: &[&[u8]], program_id: &[u8; 32]) -> Result<([u8; 32], u8), u64> {
        if seeds.len() > MAX {
            return Err(super::err::BAD_INPUT);
        }
        let mut seed_bytes: [Bytes; MAX] = core::array::from_fn(|_| Bytes { addr: core::ptr::null(), len: 0 });
        for (i, s) in seeds.iter().enumerate() {
            seed_bytes[i] = Bytes { addr: s.as_ptr(), len: s.len() as u64 };
        }
        #[cfg(target_os = "solana")]
        {
            extern "C" {
                fn sol_try_find_program_address(seeds: *const u8, seeds_len: u64, program_id: *const u8, address: *mut u8, bump: *mut u8) -> u64;
            }
            let mut address = [0u8; 32];
            let mut bump = 0u8;
            let rc = unsafe { sol_try_find_program_address(seed_bytes.as_ptr() as *const u8, seeds.len() as u64, program_id.as_ptr(), address.as_mut_ptr(), &mut bump) };
            if rc == 0 { Ok((address, bump)) } else { Err(super::err::BAD_INPUT) }
        }
        #[cfg(not(target_os = "solana"))]
        {
            let _ = (&seed_bytes, program_id);
            Err(super::err::BAD_INPUT)
        }
    }
}

/// Read the i-th little-endian u64 of a state account.
pub fn get_u64(buf: &[u8], i: usize) -> Result<u64, u64> {
    let s = buf.get(i * 8..i * 8 + 8).ok_or(err::SMALL_ACCOUNT)?;
    let mut a = [0u8; 8];
    a.copy_from_slice(s);
    Ok(u64::from_le_bytes(a))
}

/// Write the i-th little-endian u64 of a state account.
pub fn put_u64(buf: &mut [u8], i: usize, v: u64) -> Result<(), u64> {
    let s = buf.get_mut(i * 8..i * 8 + 8).ok_or(err::SMALL_ACCOUNT)?;
    s.copy_from_slice(&v.to_le_bytes());
    Ok(())
}
