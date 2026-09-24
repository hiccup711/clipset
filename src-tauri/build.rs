fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("native/clipboard.m")
            .file("native/shortcuts.m")
            .file("native/status_item.m")
            .flag("-fobjc-arc")
            .compile("copyy_native");
        for framework in ["AppKit", "ApplicationServices"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=native/clipboard.m");
        println!("cargo:rerun-if-changed=native/shortcuts.m");
        println!("cargo:rerun-if-changed=native/status_item.m");
    }
    tauri_build::build()
}
