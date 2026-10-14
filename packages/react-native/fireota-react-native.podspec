require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "fireota-react-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"] || "https://www.npmjs.com/package/@fireota/react-native"
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => "13.4" }
  # Installed from node_modules by React Native autolinking; the git source is only used for trunk.
  repo = (package["repository"].is_a?(Hash) ? package["repository"]["url"] : package["repository"]).to_s.sub(/^git\+/, "")
  s.source       = { :git => repo, :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m}"
  s.libraries    = "z"
  s.dependency "React-Core"
end
