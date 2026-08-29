{
  lib,
  stdenv,
  fetchurl,
  writeShellScriptBin,
  glibc,
}:

let
  pname = "node-hp-scan-to";
  version = (builtins.fromJSON (builtins.readFile ../../package.json)).version;

  # sha256 of the released linux tarball for each supported system. Bump these
  # together with `version` when cutting a new release; they match the
  # SHA256SUMS.txt file attached to the GitHub release.
  hashes = {
    x86_64-linux = "sha256-zf18uXN644L0CJGTFfIGm3j8VHoYFOSS48PcwAAUADU=";
    aarch64-linux = "sha256-3AdeYc+mz9mFxTHHkGisBqzRtMw5Wymz0N687HUc//Q=";
  };

  bunArch = if stdenv.hostPlatform.isx86_64 then "x64" else "arm64";
  ldLoader =
    if stdenv.hostPlatform.isx86_64 then "ld-linux-x86-64.so.2" else "ld-linux-aarch64.so.1";

  raw = stdenv.mkDerivation {
    inherit pname version;

    src = fetchurl {
      url = "https://github.com/manuc66/node-hp-scan-to/releases/download/v${version}/node-hp-scan-to-v${version}-linux-${bunArch}.tar.gz";
      hash = hashes.${stdenv.hostPlatform.system};
    };

    # The tarball extracts its contents directly at the archive root (there is
    # no single top-level directory), so keep the build in the unpack dir.
    sourceRoot = ".";

    # Stripping (or patchelf) rewrites the ELF and destroys the app bundle that
    # bun appends to the executable, turning it into a plain bun CLI. Keep the
    # binary byte-identical.
    dontStrip = true;

    installPhase = ''
      runHook preInstall

      install -Dm755 node-hp-scan-to "$out/lib/node-hp-scan-to/node-hp-scan-to"
      install -Dm644 config/default.json "$out/etc/node-hp-scan-to/default.json"
      install -Dm644 README.md "$out/share/doc/node-hp-scan-to/README.md"
      install -Dm644 SUPPORTED_DEVICES.md "$out/share/doc/node-hp-scan-to/SUPPORTED_DEVICES.md"
      install -Dm644 LICENSE "$out/share/doc/node-hp-scan-to/LICENSE"

      runHook postInstall
    '';

    meta = {
      description = "Scan document to Computer for HP All-in-One Printers";
      homepage = "https://github.com/manuc66/node-hp-scan-to";
      changelog = "https://github.com/manuc66/node-hp-scan-to/releases/tag/v${version}";
      license = lib.licenses.mit;
      mainProgram = "node-hp-scan-to";
      platforms = [ "x86_64-linux" "aarch64-linux" ];
      maintainers = [ ];
    };
  };

  # The bun-compiled binary hardcodes the ELF interpreter
  # /lib64/ld-linux-x86-64.so.2, which does not exist on NixOS. It cannot be
  # patched (patchelf/strip drop bun's embedded bundle), so run it through the
  # nixpkgs glibc loader directly instead, with --library-path pointing at the
  # libs it needs. No programs.nix-ld or FHS environment required.
  launcher = writeShellScriptBin "node-hp-scan-to" ''
    export NODE_CONFIG_DIR="${raw}/etc/node-hp-scan-to"
    exec "${glibc}/lib/${ldLoader}" --library-path "${glibc}/lib" "${raw}/lib/node-hp-scan-to/node-hp-scan-to" "$@"
  '';
in
launcher.overrideAttrs { meta = raw.meta; }