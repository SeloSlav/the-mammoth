use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("missing CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .expect("apps/server should live under repo root");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("missing OUT_DIR"));
    let out_file = out_dir.join("stair_runtime_overlay.rs");

    println!("cargo:rerun-if-changed={}", repo_root.join("scripts/gen-stair-runtime-overlay.ts").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("packages/world/src/stairRuntimeOverlay.ts").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("packages/world/src/stairElevatorPlaceholders.ts").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("packages/world/src/stairWellGeometry.ts").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("packages/world/src/buildingStairShafts.ts").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("content/building/mammoth.json").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("content/elevator/stairwell.json").display());
    println!("cargo:rerun-if-changed={}", repo_root.join("content/building/floors").display());

    let pnpm = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
    let status = Command::new(pnpm)
        .current_dir(repo_root)
        .args([
            "exec",
            "node",
            "--import",
            "tsx",
            "scripts/gen-stair-runtime-overlay.ts",
            out_file.to_string_lossy().as_ref(),
        ])
        .status()
        .expect("failed to spawn pnpm exec node --import tsx scripts/gen-stair-runtime-overlay.ts");
    if !status.success() {
        panic!("stair runtime overlay generation failed with status {status}");
    }
}
