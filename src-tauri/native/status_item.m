#import <AppKit/AppKit.h>

void copyy_configure_status_item(void *raw_item) {
    NSStatusItem *item = (__bridge NSStatusItem *)raw_item;
    // A new item normally goes at the far left, which can be behind a MacBook
    // notch. Seed a position near the clock, then let AppKit remember user moves.
    // registerDefaults supplies a fallback without overwriting a saved position.
    [NSUserDefaults.standardUserDefaults registerDefaults:@{
        @"NSStatusItem Preferred Position Clipset.StatusItem": @180
    }];
    item.autosaveName = @"Clipset.StatusItem";
    item.button.accessibilityLabel = @"Clipset 剪贴板";
}
