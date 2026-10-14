#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * FireOTA native module. In AppDelegate (release builds):
 *
 *   - (NSURL *)bundleURL {
 *     return [FireOTA bundleURL] ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
 *   }
 */
@interface FireOTA : NSObject <RCTBridgeModule>

/// The OTA bundle to load, or nil to use the bundle shipped in the app binary.
+ (nullable NSURL *)bundleURL;

@end

NS_ASSUME_NONNULL_END
