#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/IOLLEvent.h>
#include <stdint.h>

typedef void (*ClipsetKeyCallback)(uint16_t, int, int, int, uint64_t);
static id globalMonitor;
static id localMonitor;

static void deliverKey(NSEvent *event, ClipsetKeyCallback callback) {
    uint16_t code = event.keyCode;
    NSEventModifierFlags flags = event.modifierFlags;
    NSEventModifierFlags allowed = 0;
    NSUInteger deviceMask = 0;
    switch (code) {
        case 55: allowed = NSEventModifierFlagCommand; deviceMask = NX_DEVICELCMDKEYMASK; break;
        case 54: allowed = NSEventModifierFlagCommand; deviceMask = NX_DEVICERCMDKEYMASK; break;
        case 59: allowed = NSEventModifierFlagControl; deviceMask = NX_DEVICELCTLKEYMASK; break;
        case 62: allowed = NSEventModifierFlagControl; deviceMask = NX_DEVICERCTLKEYMASK; break;
        case 58: allowed = NSEventModifierFlagOption; deviceMask = NX_DEVICELALTKEYMASK; break;
        case 61: allowed = NSEventModifierFlagOption; deviceMask = NX_DEVICERALTKEYMASK; break;
    }
    NSEventModifierFlags modifiers = NSEventModifierFlagCommand | NSEventModifierFlagControl |
        NSEventModifierFlagOption | NSEventModifierFlagShift | NSEventModifierFlagFunction;
    int modified = (flags & modifiers & ~allowed) != 0;
    uint64_t time = (uint64_t)(event.timestamp * 1000);
    if (event.type == NSEventTypeFlagsChanged) {
        if (code == 57) {
            // Caps Lock produces one flagsChanged event per latch transition, not ordinary key-up.
            callback(code, 1, 0, modified, time);
            callback(code, 0, 0, modified, time);
        } else {
            callback(code, (flags & deviceMask) != 0, 0, modified, time);
        }
    } else {
        callback(code, event.type == NSEventTypeKeyDown,
                 event.type == NSEventTypeKeyDown && event.isARepeat, modified, time);
    }
}

// Main thread only. Observers never suppress events or change Caps Lock/input-source behavior.
int copyy_start_key_monitor(ClipsetKeyCallback callback) {
    if (!AXIsProcessTrusted()) return 0;
    if (globalMonitor && localMonitor) return 1;
    NSEventMask mask = NSEventMaskKeyDown | NSEventMaskKeyUp | NSEventMaskFlagsChanged;
    globalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:^(NSEvent *event) {
        deliverKey(event, callback);
    }];
    localMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        deliverKey(event, callback);
        return event;
    }];
    if (globalMonitor && localMonitor) return 1;
    if (globalMonitor) [NSEvent removeMonitor:globalMonitor];
    if (localMonitor) [NSEvent removeMonitor:localMonitor];
    globalMonitor = nil; localMonitor = nil;
    return 0;
}
void copyy_stop_key_monitor(void) {
    if (globalMonitor) [NSEvent removeMonitor:globalMonitor];
    if (localMonitor) [NSEvent removeMonitor:localMonitor];
    globalMonitor = nil; localMonitor = nil;
}
