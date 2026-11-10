Pod::Spec.new do |s|
  s.name             = 'fireota'
  s.version          = '0.1.0'
  s.summary          = 'FireOTA over-the-air updates for Flutter.'
  s.description      = <<-DESC
Asset and config updates for Flutter apps on iOS, with signed releases, staged rollouts and
automatic rollback. Dart code patches are Android only.
                       DESC
  s.homepage         = 'https://fireota.creoai.in'
  s.license          = { :file => '../LICENSE' }
  s.author           = { 'FireOTA' => 'https://github.com/Sujay-Dynamisch/FireOTA' }
  s.source           = { :path => '.' }
  s.source_files     = 'fireota/Sources/fireota/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'
  s.library = 'z'

  # Flutter.framework does not contain a i386 slice.
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version = '5.0'
  s.resource_bundles = { 'fireota_privacy' => ['fireota/Sources/fireota/PrivacyInfo.xcprivacy'] }
end
