use std::env;
use std::path::PathBuf;
use std::process::Command;

fn locate_node_executable() -> PathBuf {
    for key in ["MAMMOTH_NODE_EXE", "NODE_EXE", "npm_node_execpath"] {
        if let Some(value) = env::var_os(key) {
            let candidate = PathBuf::from(value);
            if candidate.is_file() {
                return candidate;
            }
        }
    }

    if cfg!(windows) {
        let mut candidates = Vec::new();
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(&program_files).join("nodejs").join("node.exe"));
        }
        if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)") {
            candidates.push(PathBuf::from(&program_files_x86).join("nodejs").join("node.exe"));
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(&local_app_data)
                    .join("Programs")
                    .join("nodejs")
                    .join("node.exe"),
            );
        }
        if let Some(candidate) = candidates.into_iter().find(|path| path.is_file()) {
            return candidate;
        }
    }

    PathBuf::from("node")
}

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

    let node = locate_node_executable();
    let status = Command::new(&node)
        .current_dir(repo_root)
        .args([
            "--import",
            "tsx",
            "scripts/gen-stair-runtime-overlay.ts",
            out_file.to_string_lossy().as_ref(),
        ])
        .status()
        .unwrap_or_else(|err| panic!("failed to spawn {} --import tsx scripts/gen-stair-runtime-overlay.ts: {err}", node.display()));
    if !status.success() {
        panic!("stair runtime overlay generation failed with status {status}");
    }
}
