// In-process event decoding tests: no system key events, monitors or permissions are used.
#import "shortcuts.m"
#include <assert.h>
static int calls, lastDown, lastRepeat, lastModified;
static uint16_t lastCode;
static void received(uint16_t code, int down, int repeat, int modified, uint64_t time) {
    calls++; lastCode = code; lastDown = down; lastRepeat = repeat; lastModified = modified;
    assert(time == 1000);
}
static void decode_event(NSEventType type, uint16_t code, NSEventModifierFlags flags, BOOL repeat) {
    NSEvent *event = [NSEvent keyEventWithType:type location:NSZeroPoint modifierFlags:flags
        timestamp:1 windowNumber:0 context:nil characters:@"" charactersIgnoringModifiers:@""
        isARepeat:repeat keyCode:code];
    deliverKey(event, received);
}
int main(void) {
    @autoreleasepool {
        uint16_t codes[] = {55,54,59,62,58,61};
        NSUInteger device[] = {NX_DEVICELCMDKEYMASK,NX_DEVICERCMDKEYMASK,NX_DEVICELCTLKEYMASK,NX_DEVICERCTLKEYMASK,NX_DEVICELALTKEYMASK,NX_DEVICERALTKEYMASK};
        NSEventModifierFlags family[] = {NSEventModifierFlagCommand,NSEventModifierFlagCommand,NSEventModifierFlagControl,NSEventModifierFlagControl,NSEventModifierFlagOption,NSEventModifierFlagOption};
        for (int i=0;i<6;i++) {
            decode_event(NSEventTypeFlagsChanged,codes[i],family[i]|device[i],NO);
            assert(lastDown && !lastModified && lastCode == codes[i]);
            decode_event(NSEventTypeFlagsChanged,codes[i],0,NO);
            assert(!lastDown);
            decode_event(NSEventTypeFlagsChanged,codes[i],family[i]|device[i]|NSEventModifierFlagShift,NO);
            assert(lastModified);
        }
        int before = calls;
        decode_event(NSEventTypeFlagsChanged,57,NSEventModifierFlagCapsLock,NO);
        assert(calls == before+2 && lastCode == 57 && !lastDown && !lastModified);
        decode_event(NSEventTypeFlagsChanged,57,0,NO);
        assert(calls == before+4);
        decode_event(NSEventTypeKeyDown,49,0,YES);
        assert(lastCode == 49 && lastDown && lastRepeat);
        decode_event(NSEventTypeKeyUp,49,0,NO);
        assert(!lastDown && !lastRepeat);
        decode_event(NSEventTypeKeyDown,49,NSEventModifierFlagCommand,NO);
        assert(lastModified);
        puts("Native shortcut decoding passed (left/right modifiers, Caps Lock, Space and repeats).");
    }
}
