#import "EATrade-Bridging-Header.h"

@interface RCT_EXTERN_MODULE(WidgetDataManager, NSObject)

RCT_EXTERN_METHOD(updateWidgetData:(NSString *)botName
                  isActive:(BOOL)isActive
                  isPaused:(BOOL)isPaused
                  botImageURL:(NSString * _Nullable)botImageURL
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(syncWidgetPollingState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end

