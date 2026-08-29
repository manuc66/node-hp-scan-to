{
  description = "Scan document to Computer for HP All-in-One Printers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      # The release only ships prebuilt binaries for these platforms
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
      pkgFor = system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.callPackage ./packaging/nix/package.nix { };
    in
    {
      packages = forAllSystems (system: {
        default = pkgFor system;
        node-hp-scan-to = pkgFor system;
      });

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${pkgFor system}/bin/node-hp-scan-to";
          meta = {
            description = "Scan document to Computer for HP All-in-One Printers";
            mainProgram = "node-hp-scan-to";
          };
        };
      });
    };
}