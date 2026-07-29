//! win_rawprint.exe — Windows spooler raw-print helper for SpicyHome POS.
//!
//! Usage:
//!   win_rawprint.exe <printerName> <path-to-bin-file>
//!   win_rawprint.exe --list
//!   win_rawprint.exe --help
//!
//! Exit codes:
//!   0  success
//!   1  bad usage
//!   2  OpenPrinter failed
//!   3  StartDoc/Write/EndPage failed
//!   4  file I/O error
//!   5  unsupported platform (non-Windows)

use std::env;
use std::process;

const HELP: &str = r#"win_rawprint.exe — Windows spooler raw-print helper

USAGE:
  win_rawprint.exe <printerName> <path-to-bin-file>
      Send a raw binary file to the named Windows printer queue.

  win_rawprint.exe --list
      List locally installed and network-connected printer queue names.

  win_rawprint.exe --help
      Print this message.

EXIT CODES:
  0  success
  1  bad usage / missing arguments
  2  OpenPrinterW failed (printer not found, offline, or access denied)
  3  StartDocPrinterW / StartPagePrinter / WritePrinter / EndPagePrinter failed
  4  file I/O error (cannot read input file)
  5  unsupported platform (not Windows)
"#;

#[cfg(windows)]
mod winprint {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
    };

    /// Convert a Rust &str to a null-terminated wide string (UTF-16).
    fn to_wstring(s: &str) -> Vec<u16> {
        let mut v: Vec<u16> = OsStr::new(s).encode_wide().collect();
        v.push(0);
        v
    }

    /// Send raw bytes to a named Windows printer queue.
    /// Returns Ok(()) on success, or an error string on failure.
    pub fn raw_print(printer_name: &str, data: &[u8]) -> Result<(), String> {
        let pn_wide = to_wstring(printer_name);

        // 1. OpenPrinterW
        let mut handle: HANDLE = 0;
        let result = unsafe {
            OpenPrinterW(
                pn_wide.as_ptr() as *mut u16,
                &mut handle,
                ptr::null(),
            )
        };
        if result == 0 {
            return Err(format!(
                "OpenPrinterW failed for '{}': error {}",
                printer_name,
                unsafe { windows_sys::Win32::Foundation::GetLastError() }
            ));
        }

        // 2. StartDocPrinterW (level 1, RAW datatype)
        let doc_name_wide = to_wstring("SpicyHome");
        let datatype_wide = to_wstring("RAW");

        let doc_info = DOC_INFO_1W {
            pDocName: doc_name_wide.as_ptr() as *mut u16,
            pOutputFile: ptr::null_mut(),
            pDatatype: datatype_wide.as_ptr() as *mut u16,
        };

        let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
        if job_id == 0 {
            let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            unsafe { ClosePrinter(handle) };
            return Err(format!("StartDocPrinterW failed: error {}", err));
        }

        // 3. StartPagePrinter
        if unsafe { StartPagePrinter(handle) } == 0 {
            let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            unsafe {
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }
            return Err(format!("StartPagePrinter failed: error {}", err));
        }

        // 4. WritePrinter — loop for short writes
        let mut written: u32 = 0;
        let total = data.len() as u32;
        let result = unsafe {
            WritePrinter(
                handle,
                data.as_ptr() as *const _,
                total,
                &mut written,
            )
        };

        if result == 0 {
            let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            unsafe {
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }
            return Err(format!("WritePrinter failed: error {}", err));
        }

        // If the write was short, loop until all data is written.
        // WritePrinter does not guarantee writing all bytes in one call.
        let mut offset = written;
        while offset < total {
            let remaining = total - offset;
            let mut chunk_written: u32 = 0;
            let result = unsafe {
                WritePrinter(
                    handle,
                    data.as_ptr().add(offset as usize) as *const _,
                    remaining,
                    &mut chunk_written,
                )
            };
            if result == 0 {
                let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
                unsafe {
                    EndPagePrinter(handle);
                    EndDocPrinter(handle);
                    ClosePrinter(handle);
                }
                return Err(format!("WritePrinter (loop) failed: error {}", err));
            }
            if chunk_written == 0 {
                unsafe {
                    EndPagePrinter(handle);
                    EndDocPrinter(handle);
                    ClosePrinter(handle);
                }
                return Err("WritePrinter wrote 0 bytes".to_string());
            }
            offset += chunk_written;
        }

        // 5. EndPagePrinter
        if unsafe { EndPagePrinter(handle) } == 0 {
            let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            unsafe {
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }
            return Err(format!("EndPagePrinter failed: error {}", err));
        }

        // 6. EndDocPrinter
        if unsafe { EndDocPrinter(handle) } == 0 {
            let err = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            unsafe { ClosePrinter(handle) };
            return Err(format!("EndDocPrinter failed: error {}", err));
        }

        // 7. ClosePrinter
        unsafe { ClosePrinter(handle) };

        Ok(())
    }

    /// Windows PRINTER_INFO_2W layout with the fields we need.
    #[repr(C)]
    struct PrinterInfo2 {
        p_server_name: *const u16,
        p_printer_name: *const u16,
        p_share_name: *const u16,
        p_port_name: *const u16,
        p_driver_name: *const u16,
        p_comment: *const u16,
        p_location: *const u16,
        p_dev_mode: *const u8,
        p_sep_file: *const u16,
        p_print_processor: *const u16,
        p_datatype: *const u16,
        p_parameters: *const u16,
        p_security_descriptor: *const u8,
        attributes: u32,
        priority: u32,
        default_priority: u32,
        start_time: u32,
        until_time: u32,
        status: u32,
        c_jobs: u32,
        average_ppm: u32,
    }

    /// List printer queue names (local + connections).
    pub fn list_queues() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;

        // First call: get required buffer size
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        unsafe {
            EnumPrintersW(
                flags,
                ptr::null(),
                2, // level 2 = PRINTER_INFO_2W
                ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
        }

        if needed == 0 {
            return Ok(Vec::new());
        }

        // Allocate buffer
        let mut buf: Vec<u8> = vec![0u8; needed as usize];
        unsafe {
            let result = EnumPrintersW(
                flags,
                ptr::null(),
                2,
                buf.as_mut_ptr() as *mut _,
                needed,
                &mut needed,
                &mut returned,
            );
            if result == 0 {
                let err = windows_sys::Win32::Foundation::GetLastError();
                return Err(format!("EnumPrintersW failed: error {}", err));
            }
        }

        // Parse PRINTER_INFO_2W records from the buffer
        let mut names = Vec::with_capacity(returned as usize);
        let base = buf.as_ptr() as *const PrinterInfo2;

        for i in 0..returned as usize {
            let info = unsafe { &*base.add(i) };
            let p_name = info.p_printer_name;
            if !p_name.is_null() {
                // Read null-terminated wide string
                let len = unsafe { (0..).take_while(|&j| *p_name.add(j) != 0).count() };
                let wide_slice = unsafe { std::slice::from_raw_parts(p_name, len) };
                let name = String::from_utf16_lossy(wide_slice);
                names.push(name);
            }
        }

        Ok(names)
    }
}

// ── CLI entry point ──────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("win_rawprint: missing command. Use --help for usage.");
        process::exit(1);
    }

    let cmd = &args[1];

    match cmd.as_str() {
        "--help" | "-h" => {
            print!("{}", HELP);
            process::exit(0);
        }
        "--list" => {
            #[cfg(not(windows))]
            {
                eprintln!("win_rawprint: --list is only supported on Windows.");
                process::exit(5);
            }
            #[cfg(windows)]
            {
                match winprint::list_queues() {
                    Ok(queues) => {
                        for name in &queues {
                            println!("{}", name);
                        }
                        process::exit(0);
                    }
                    Err(e) => {
                        eprintln!("win_rawprint: {}", e);
                        process::exit(2);
                    }
                }
            }
        }
        _ => {
            // win_rawprint.exe <printerName> <path-to-bin>
            if args.len() < 3 {
                eprintln!(
                    "win_rawprint: missing arguments. Usage: win_rawprint.exe <printerName> <path-to-bin>"
                );
                process::exit(1);
            }

            let printer_name = &args[1];
            let file_path = &args[2];

            #[cfg(not(windows))]
            {
                // Suppress unused variable warnings on non-Windows
                let _ = (printer_name, file_path);
                eprintln!("win_rawprint: printing is only supported on Windows.");
                process::exit(5);
            }

            #[cfg(windows)]
            {
                let data = match std::fs::read(file_path) {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("win_rawprint: cannot read '{}': {}", file_path, e);
                        process::exit(4);
                    }
                };

                if data.is_empty() {
                    eprintln!("win_rawprint: input file '{}' is empty, nothing to print.", file_path);
                    process::exit(0);
                }

                match winprint::raw_print(printer_name, &data) {
                    Ok(()) => process::exit(0),
                    Err(e) => {
                        eprintln!("win_rawprint: {}", e);
                        process::exit(3);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_help_args() {
        assert!(HELP.contains("win_rawprint.exe"));
        assert!(HELP.contains("<printerName>"));
        assert!(HELP.contains("--list"));
        assert!(HELP.contains("--help"));
        assert!(HELP.contains("EXIT CODES"));
    }

    #[test]
    fn test_unsupported_platform_message() {
        assert!(HELP.contains("unsupported platform"));
    }
}
