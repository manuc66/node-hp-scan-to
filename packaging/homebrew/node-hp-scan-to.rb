cask "node-hp-scan-to" do
  version "1.11.0"

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
    printer panel. Configure your printer in:
      ~/Library/Application Support/node-hp-scan-to/config/default.json

    To start it at login, see the LaunchAgent shipped inside the app:
      /Applications/node-hp-scan-to.app/Contents/Resources/io.github.manuc66.node-hp-scan-to.plist
  EOS
end