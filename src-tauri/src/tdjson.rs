//! Тонкая обёртка над C-интерфейсом официальной библиотеки TDLib (tdjson).
//! Всё шифрование и протокол MTProto выполняет сама TDLib.

use libloading::Library;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int};
use std::path::Path;

type CreateClientId = unsafe extern "C" fn() -> c_int;
type Send = unsafe extern "C" fn(c_int, *const c_char);
type Receive = unsafe extern "C" fn(c_double) -> *const c_char;
type Execute = unsafe extern "C" fn(*const c_char) -> *const c_char;

pub struct TdJson {
    _lib: Library,
    create_client_id: CreateClientId,
    send: Send,
    receive: Receive,
    execute: Execute,
}

// Функции tdjson потокобезопасны (td_receive вызываем только из одного потока).
unsafe impl std::marker::Send for TdJson {}
unsafe impl Sync for TdJson {}

impl TdJson {
    pub fn load(path: &Path) -> Result<Self, String> {
        unsafe {
            #[cfg(windows)]
            let lib: Library = libloading::os::windows::Library::load_with_flags(
                path,
                libloading::os::windows::LOAD_WITH_ALTERED_SEARCH_PATH,
            )
            .map_err(|e| format!("не удалось загрузить {}: {e}", path.display()))?
            .into();
            #[cfg(not(windows))]
            let lib = Library::new(path)
                .map_err(|e| format!("не удалось загрузить {}: {e}", path.display()))?;

            let create_client_id = *lib
                .get::<CreateClientId>(b"td_create_client_id\0")
                .map_err(|e| e.to_string())?;
            let send = *lib.get::<Send>(b"td_send\0").map_err(|e| e.to_string())?;
            let receive = *lib.get::<Receive>(b"td_receive\0").map_err(|e| e.to_string())?;
            let execute = *lib.get::<Execute>(b"td_execute\0").map_err(|e| e.to_string())?;
            Ok(Self { _lib: lib, create_client_id, send, receive, execute })
        }
    }

    pub fn create_client(&self) -> i32 {
        unsafe { (self.create_client_id)() }
    }

    pub fn send(&self, client: i32, request: &str) -> Result<(), String> {
        let c = CString::new(request).map_err(|_| "в запросе есть нулевой байт".to_string())?;
        unsafe { (self.send)(client, c.as_ptr()) };
        Ok(())
    }

    pub fn receive(&self, timeout: f64) -> Option<String> {
        let ptr = unsafe { (self.receive)(timeout) };
        if ptr.is_null() {
            return None;
        }
        Some(unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned())
    }

    pub fn execute(&self, request: &str) -> Option<String> {
        let c = CString::new(request).ok()?;
        let ptr = unsafe { (self.execute)(c.as_ptr()) };
        if ptr.is_null() {
            return None;
        }
        Some(unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned())
    }
}
