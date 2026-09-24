use crate::store::{Payload, Result};
use std::ffi::{c_char, c_int, c_long, c_void, CStr, CString};
unsafe extern "C" {
    fn copyy_change_count() -> c_long;
    fn copyy_read_content() -> *mut c_char;
    fn copyy_write_content(value: *const c_char) -> c_int;
    fn copyy_frontmost_pid() -> c_int;
    fn copyy_frontmost_name() -> *mut c_char;
    fn copyy_activate(pid: c_int) -> c_int;
    fn copyy_trusted() -> c_int;
    fn copyy_open_accessibility();
    fn copyy_modifiers_released() -> c_int;
    fn copyy_paste(target: c_int) -> c_int;
    fn copyy_free(value: *mut c_char);
    fn copyy_start_key_monitor(callback: extern "C" fn(u16, c_int, c_int, c_int, u64)) -> c_int;
    fn copyy_stop_key_monitor();
    fn copyy_configure_status_item(item: *mut c_void);
}
pub fn configure_status_item(item: *mut c_void) {
    unsafe { copyy_configure_status_item(item) }
}
pub fn start_key_monitor(callback: extern "C" fn(u16, c_int, c_int, c_int, u64)) -> Result<()> {
    if unsafe { copyy_start_key_monitor(callback) } != 0 {
        Ok(())
    } else {
        Err(if trusted() {
            "系统键盘监听未能启动，请重新保存设置或重启 Clipset"
        } else {
            "当前运行的 Clipset 尚未获得辅助功能权限，授权后会自动启用"
        }
        .into())
    }
}
pub fn stop_key_monitor() {
    unsafe { copyy_stop_key_monitor() }
}
unsafe fn owned_string(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let result = CStr::from_ptr(ptr).to_string_lossy().into_owned();
    copyy_free(ptr);
    Some(result)
}
pub fn change_count() -> i64 {
    unsafe { copyy_change_count() as i64 }
}
pub fn read() -> Option<Payload> {
    unsafe { owned_string(copyy_read_content()) }.and_then(|s| serde_json::from_str(&s).ok())
}
pub fn write(payload: &Payload) -> Result<()> {
    let value = CString::new(serde_json::to_string(payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    match unsafe { copyy_write_content(value.as_ptr()) } {
        1 => Ok(()),
        -1 => Err("原文件已移动或删除，无法复制".into()),
        _ => Err("写入剪贴板失败".into()),
    }
}
pub fn frontmost_pid() -> i32 {
    unsafe { copyy_frontmost_pid() }
}
pub fn frontmost_name() -> String {
    unsafe { owned_string(copyy_frontmost_name()) }.unwrap_or_default()
}
pub fn activate(pid: i32) -> bool {
    unsafe { copyy_activate(pid) != 0 }
}
pub fn trusted() -> bool {
    unsafe { copyy_trusted() != 0 }
}
pub fn open_accessibility() {
    unsafe { copyy_open_accessibility() }
}
pub fn modifiers_released() -> bool {
    unsafe { copyy_modifiers_released() != 0 }
}
pub fn paste(target: i32) -> bool {
    unsafe { copyy_paste(target) != 0 }
}
