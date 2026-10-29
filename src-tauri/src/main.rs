// 发布版在 Windows 上不弹出黑色控制台。调试版仍保留，方便看 Rust 报错。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    showmd_lib::run()
}
