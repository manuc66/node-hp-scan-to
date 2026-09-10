cask "node-hp-scan-to" do
  version "1.11.1"

  # Universal (Intel + Apple Silicon) DMG attached to each GitHub release.
  # The DMG is rebuilt on every release, so the checksum is not pinned
  # (:no_check); Homebrew still verifies the download size.
  sha256 :no_check
  url "https://github.com/manuc66/node-hp-scan-to/releases/download/v#{version}/node-hp-scan-to-v#{version}-macos.dmg"
  name "node-hp-scan-to"
  desc "Scan documents from your HP printer to this computer (independent community tool)"
  homepage "https://github.com/manuc66/node-hp-scan-to"

  app "node-hp-scan-to.app"

  caveats <<~EOS
    The app runs in the background and waits for scan jobs started from the
    printer panel. It reads config/default.json next to its binary
    (override with the NODE_CONFIG_DIR environment variable).

    To start it at login, copy the shipped LaunchAgent and edit the paths:
      /Applications/node-hp-scan-to.app/Contents/Resources/io.github.manuc66.node-hp-scan-to.plist
  EOS
end