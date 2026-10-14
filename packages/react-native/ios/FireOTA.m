#import "FireOTA.h"

#import <CommonCrypto/CommonDigest.h>
#import <React/RCTReloadCommand.h>
#import <zlib.h>

static NSString *const kBundleName = @"main.jsbundle";
static NSString *const kSuite = @"dev.fireota";
static NSString *const kInstallation = @"installationId";
static NSString *const kBinary = @"binary";
static NSString *const kCurrent = @"current";
static NSString *const kPrevious = @"previous";
static NSString *const kPending = @"pending";
static NSString *const kDownloaded = @"downloaded";
static NSString *const kFailed = @"failed";
static NSString *const kUnconfirmed = @"unconfirmed";
static NSString *const kAttempts = @"attempts";

static NSUserDefaults *FOTADefaults(void) { return [[NSUserDefaults alloc] initWithSuiteName:kSuite]; }

static NSString *FOTASafe(NSString *value)
{
  NSCharacterSet *allowed = [NSCharacterSet characterSetWithCharactersInString:
      @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"];
  return [[value componentsSeparatedByCharactersInSet:allowed.invertedSet] componentsJoinedByString:@""];
}

static NSURL *FOTARoot(void)
{
  NSURL *support = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                          inDomains:NSUserDomainMask].firstObject;
  NSURL *root = [support URLByAppendingPathComponent:@"fireota/releases" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil];
  [root setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
  return root;
}

static NSURL *FOTAReleaseDir(NSString *releaseId)
{
  return [FOTARoot() URLByAppendingPathComponent:FOTASafe(releaseId) isDirectory:YES];
}

static NSURL *FOTABundleFile(NSString *releaseId)
{
  return [FOTAReleaseDir(releaseId) URLByAppendingPathComponent:kBundleName];
}

/// Changes on every App Store / TestFlight install, which invalidates bundles built for the old binary.
static NSString *FOTABinaryVersion(void)
{
  NSDictionary *info = [NSBundle mainBundle].infoDictionary;
  NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:[NSBundle mainBundle].executablePath error:nil];
  return [NSString stringWithFormat:@"%@-%@-%.0f", info[@"CFBundleShortVersionString"] ?: @"", info[@"CFBundleVersion"] ?: @"",
                                    [attrs.fileModificationDate timeIntervalSince1970]];
}

static BOOL FOTAExists(NSURL *url) { return [[NSFileManager defaultManager] fileExistsAtPath:url.path]; }

static BOOL FOTARead(gzFile gz, void *into, unsigned length)
{
  unsigned done = 0;
  while (done < length) {
    int n = gzread(gz, (char *)into + done, length - done);
    if (n <= 0) return NO;
    done += (unsigned)n;
  }
  return YES;
}

@implementation FireOTA

RCT_EXPORT_MODULE(FireOTA)

+ (BOOL)requiresMainQueueSetup { return NO; }

/// Same launch rules as Android: a new binary clears OTA state, a pending release is promoted and
/// must confirm, and a release reaching a second launch unconfirmed is rolled back.
+ (nullable NSURL *)bundleURL
{
  static NSURL *resolved = nil;
  static BOOL didResolve = NO;
  @synchronized(self) {
    NSUserDefaults *d = FOTADefaults();
    BOOL hasPending = [d stringForKey:kPending] != nil;
    if (didResolve && !hasPending) return resolved; // once per launch, unless a reload applies an update

    NSString *binary = FOTABinaryVersion();
    if (![[d stringForKey:kBinary] isEqualToString:binary]) {
      [[NSFileManager defaultManager] removeItemAtURL:FOTARoot() error:nil];
      for (NSString *key in @[ kCurrent, kPrevious, kPending, kDownloaded ]) [d removeObjectForKey:key];
      [d setBool:NO forKey:kUnconfirmed];
      [d setInteger:0 forKey:kAttempts];
      [d setObject:binary forKey:kBinary];
    }

    NSString *pending = [d stringForKey:kPending];
    if (pending && FOTAExists(FOTABundleFile(pending))) {
      NSString *current = [d stringForKey:kCurrent];
      if (current) [d setObject:current forKey:kPrevious]; else [d removeObjectForKey:kPrevious];
      [d setObject:pending forKey:kCurrent];
      [d setBool:YES forKey:kUnconfirmed];
      [d setInteger:0 forKey:kAttempts];
    }
    [d removeObjectForKey:kPending];

    if ([d boolForKey:kUnconfirmed]) {
      NSInteger attempts = [d integerForKey:kAttempts] + 1;
      if (attempts >= 2) {
        NSString *failed = [d stringForKey:kCurrent];
        if (failed) {
          [d setObject:failed forKey:kFailed];
          [[NSFileManager defaultManager] removeItemAtURL:FOTAReleaseDir(failed) error:nil];
        }
        NSString *previous = [d stringForKey:kPrevious];
        if (previous) [d setObject:previous forKey:kCurrent]; else [d removeObjectForKey:kCurrent];
        [d removeObjectForKey:kPrevious];
        [d setBool:NO forKey:kUnconfirmed];
        [d setInteger:0 forKey:kAttempts];
      } else {
        [d setInteger:attempts forKey:kAttempts];
      }
    }

    resolved = nil;
    NSString *current = [d stringForKey:kCurrent];
    if (current) {
      NSURL *file = FOTABundleFile(current);
      if (FOTAExists(file)) {
        resolved = file;
      } else {
        [d removeObjectForKey:kCurrent];
        [d setBool:NO forKey:kUnconfirmed];
      }
    }
    didResolve = YES;
    return resolved;
  }
}

RCT_EXPORT_METHOD(getState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *d = FOTADefaults();
  NSString *installation = [d stringForKey:kInstallation];
  if (!installation) {
    installation = [NSUUID UUID].UUIDString.lowercaseString;
    [d setObject:installation forKey:kInstallation];
  }
  NSString *version = [NSBundle mainBundle].infoDictionary[@"CFBundleShortVersionString"] ?: @"";
  resolve(@{
    @"installationId" : installation,
    @"nativeVersion" : version,
    @"appVersion" : version,
    @"currentReleaseId" : [d stringForKey:kCurrent] ?: [NSNull null],
    @"pendingReleaseId" : [d stringForKey:kPending] ?: [NSNull null],
    @"previousReleaseId" : [d stringForKey:kPrevious] ?: [NSNull null],
    @"failedReleaseId" : [d stringForKey:kFailed] ?: [NSNull null],
    @"isFirstRun" : @([d boolForKey:kUnconfirmed]),
  });
}

RCT_EXPORT_METHOD(downloadUpdate:(NSString *)urlString
                  sha256:(NSString *)expected
                  releaseId:(NSString *)releaseId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL URLWithString:urlString];
  if (!url || ![url.scheme isEqualToString:@"https"]) {
    reject(@"FIREOTA_DOWNLOAD", @"Updates must be downloaded over HTTPS.", nil);
    return;
  }
  NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
  config.timeoutIntervalForRequest = 60;
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config];
  [[session downloadTaskWithURL:url
              completionHandler:^(NSURL *location, NSURLResponse *response, NSError *error) {
                NSInteger status =
                    [response isKindOfClass:[NSHTTPURLResponse class]] ? ((NSHTTPURLResponse *)response).statusCode : 0;
                if (error || !location || status < 200 || status > 299) {
                  reject(@"FIREOTA_DOWNLOAD", [NSString stringWithFormat:@"Download failed (HTTP %ld).", (long)status], error);
                  return;
                }
                if (![[FireOTA sha256OfFile:location] isEqualToString:expected.lowercaseString]) {
                  reject(@"FIREOTA_CHECKSUM", @"Checksum mismatch: the update was rejected.", nil);
                  return;
                }
                NSFileManager *fm = [NSFileManager defaultManager];
                NSURL *staging =
                    [FOTARoot() URLByAppendingPathComponent:[NSString stringWithFormat:@".%@.staging", FOTASafe(releaseId)]];
                [fm removeItemAtURL:staging error:nil];
                NSString *problem = [FireOTA unpack:location into:staging];
                if (!problem && !FOTAExists([staging URLByAppendingPathComponent:kBundleName])) {
                  problem = @"The update package has no main.jsbundle.";
                }
                if (problem) {
                  [fm removeItemAtURL:staging error:nil];
                  reject(@"FIREOTA_DOWNLOAD", problem, nil);
                  return;
                }
                NSURL *target = FOTAReleaseDir(releaseId);
                [fm removeItemAtURL:target error:nil];
                NSError *moveError = nil;
                if (![fm moveItemAtURL:staging toURL:target error:&moveError]) {
                  reject(@"FIREOTA_DOWNLOAD", @"Could not store the update.", moveError);
                  return;
                }
                [FOTADefaults() setObject:releaseId forKey:kDownloaded];
                resolve(nil);
              }] resume];
}

RCT_EXPORT_METHOD(installUpdate:(NSString *)releaseId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  if (!FOTAExists(FOTABundleFile(releaseId))) {
    reject(@"FIREOTA_INSTALL", @"This release has not been downloaded.", nil);
    return;
  }
  NSUserDefaults *d = FOTADefaults();
  [d setObject:releaseId forKey:kPending];
  [d removeObjectForKey:kDownloaded];
  resolve(nil);
}

RCT_EXPORT_METHOD(markSuccess:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *d = FOTADefaults();
  [d setBool:NO forKey:kUnconfirmed];
  [d setInteger:0 forKey:kAttempts];
  NSMutableSet *keep = [NSMutableSet set];
  for (NSString *key in @[ kCurrent, kPrevious, kPending, kDownloaded ]) {
    NSString *value = [d stringForKey:key];
    if (value) [keep addObject:FOTASafe(value)];
  }
  NSFileManager *fm = [NSFileManager defaultManager];
  for (NSURL *dir in [fm contentsOfDirectoryAtURL:FOTARoot() includingPropertiesForKeys:nil options:0 error:nil]) {
    if (![keep containsObject:dir.lastPathComponent]) [fm removeItemAtURL:dir error:nil];
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(clearPending:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  [FOTADefaults() removeObjectForKey:kPending];
  [FOTADefaults() removeObjectForKey:kDownloaded];
  resolve(nil);
}

RCT_EXPORT_METHOD(clearFailed:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  [FOTADefaults() removeObjectForKey:kFailed];
  resolve(nil);
}

/// Reloads JavaScript; React Native asks AppDelegate.bundleURL again, which applies the pending release.
RCT_EXPORT_METHOD(restartApp:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  resolve(nil);
  dispatch_async(dispatch_get_main_queue(), ^{
    RCTTriggerReloadCommandListeners(@"FireOTA update");
  });
}

+ (NSString *)sha256OfFile:(NSURL *)url
{
  NSInputStream *stream = [NSInputStream inputStreamWithURL:url];
  [stream open];
  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  uint8_t buffer[65536];
  NSInteger read;
  while ((read = [stream read:buffer maxLength:sizeof(buffer)]) > 0) CC_SHA256_Update(&ctx, buffer, (CC_LONG)read);
  [stream close];
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [hex appendFormat:@"%02x", digest[i]];
  return hex;
}

/// FireOTA package: gzip("FOTA1\n" | u32 big-endian header length | JSON {files:[{path,size}]} | bytes).
/// Paths are validated so a package can never write outside its release directory.
+ (nullable NSString *)unpack:(NSURL *)archive into:(NSURL *)dir
{
  gzFile gz = gzopen(archive.fileSystemRepresentation, "rb");
  if (!gz) return @"Could not open the update package.";
  char magic[6];
  uint8_t lengthBytes[4];
  if (!FOTARead(gz, magic, 6) || memcmp(magic, "FOTA1\n", 6) != 0 || !FOTARead(gz, lengthBytes, 4)) {
    gzclose(gz);
    return @"Not a FireOTA package.";
  }
  uint32_t headerLength = ((uint32_t)lengthBytes[0] << 24) | ((uint32_t)lengthBytes[1] << 16) |
                          ((uint32_t)lengthBytes[2] << 8) | lengthBytes[3];
  if (headerLength == 0 || headerLength > 4 * 1024 * 1024) {
    gzclose(gz);
    return @"Invalid package header.";
  }
  NSMutableData *header = [NSMutableData dataWithLength:headerLength];
  if (!FOTARead(gz, header.mutableBytes, headerLength)) {
    gzclose(gz);
    return @"Truncated update package.";
  }
  id json = [NSJSONSerialization JSONObjectWithData:header options:0 error:nil];
  NSArray *files = [json isKindOfClass:[NSDictionary class]] ? json[@"files"] : nil;
  if (![files isKindOfClass:[NSArray class]]) {
    gzclose(gz);
    return @"Invalid package header.";
  }

  NSString *problem = nil;
  NSFileManager *fm = [NSFileManager defaultManager];
  NSString *base = [dir.path stringByStandardizingPath];
  [fm createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil];
  uint8_t buffer[65536];
  for (NSDictionary *entry in files) {
    NSString *path = entry[@"path"];
    if (![path isKindOfClass:[NSString class]]) {
      problem = @"Invalid package header.";
      break;
    }
    NSString *out = [[base stringByAppendingPathComponent:path] stringByStandardizingPath];
    if ([path hasPrefix:@"/"] || [path containsString:@".."] || ![out hasPrefix:[base stringByAppendingString:@"/"]]) {
      problem = [NSString stringWithFormat:@"Unsafe path in update package: %@", path];
      break;
    }
    [fm createDirectoryAtPath:[out stringByDeletingLastPathComponent] withIntermediateDirectories:YES attributes:nil error:nil];
    [fm createFileAtPath:out contents:nil attributes:nil];
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:out];
    unsigned long long remaining = [entry[@"size"] unsignedLongLongValue];
    while (remaining > 0) {
      unsigned chunk = (unsigned)MIN((unsigned long long)sizeof(buffer), remaining);
      if (!FOTARead(gz, buffer, chunk)) {
        problem = @"Truncated update package.";
        break;
      }
      [handle writeData:[NSData dataWithBytes:buffer length:chunk]];
      remaining -= chunk;
    }
    [handle closeFile];
    if (problem) break;
  }
  gzclose(gz);
  return problem;
}

@end
