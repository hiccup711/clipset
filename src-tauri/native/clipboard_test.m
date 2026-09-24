#import <AppKit/AppKit.h>
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>

extern char *copyy_read_content(void);
extern int copyy_write_content(const char *json);
extern void copyy_free(char *value);
extern int copyy_trusted(void);
static NSDictionary *readPayload(void) {
    char *raw=copyy_read_content();
    if (!raw) return nil;
    NSData *data=[[NSString stringWithUTF8String:raw] dataUsingEncoding:NSUTF8StringEncoding];
    copyy_free(raw);
    return [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
}
static int writePayload(NSDictionary *value) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    return copyy_write_content([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
static void require(BOOL value,const char *name) { if (!value) @throw [NSException exceptionWithName:@"TestFailure" reason:[NSString stringWithUTF8String:name] userInfo:nil]; printf("PASS %s\n",name); }
int main(int argc,const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        NSPasteboard *pb=NSPasteboard.generalPasteboard;
        // Keep the existing clipboard only in memory, including every original representation.
        NSMutableArray *original=[NSMutableArray array];
        for (NSPasteboardItem *item in pb.pasteboardItems) {
            NSPasteboardItem *saved=[NSPasteboardItem new];
            for (NSPasteboardType type in item.types) { NSData *data=[item dataForType:type]; if(data) [saved setData:data forType:type]; }
            [original addObject:saved];
        }
        NSInteger ownedCount=pb.changeCount;
        int result=0;
        NSString *file=[NSTemporaryDirectory() stringByAppendingPathComponent:[@"copyy-native-" stringByAppendingString:NSUUID.UUID.UUIDString]];
        @try {
            NSString *text=@"Copyy QA 中文 🪄\nsecond line";
            require(writePayload(@{@"kind":@"text",@"content":text})==1,"write Unicode text"); ownedCount=pb.changeCount;
            require([readPayload()[@"content"] isEqualToString:text],"round-trip Unicode text");
            [pb setData:[NSData data] forType:@"org.nspasteboard.ConcealedType"];ownedCount=pb.changeCount;
            require(readPayload()==nil,"ignore concealed clipboard payload");
            require(argc==2,"image fixture argument");
            NSData *png=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];
            require(writePayload(@{@"kind":@"image",@"content":[png base64EncodedStringWithOptions:0]})==1,"write PNG");ownedCount=pb.changeCount;
            NSDictionary *image=readPayload();
            require([image[@"kind"] isEqual:@"image"] && [image[@"width"] intValue]>0 && [image[@"height"] intValue]>0,"capture PNG dimensions");
            require([[[NSData alloc] initWithBase64EncodedString:image[@"preview"] options:0] length]>0,"generate preview thumbnail");
            [@"temporary QA file" writeToFile:file atomically:YES encoding:NSUTF8StringEncoding error:nil];
            NSString *url=[NSURL fileURLWithPath:file].absoluteString;
            NSData *urls=[NSJSONSerialization dataWithJSONObject:@[url] options:0 error:nil];
            NSString *content=[[NSString alloc] initWithData:urls encoding:NSUTF8StringEncoding];
            require(writePayload(@{@"kind":@"files",@"content":content})==1,"write file URLs");ownedCount=pb.changeCount;
            NSDictionary *files=readPayload();
            require([files[@"kind"] isEqual:@"files"] && [files[@"content"] isEqual:content],"capture file URLs without copying file contents");
            [[NSFileManager defaultManager] removeItemAtPath:file error:nil];
            require(writePayload(@{@"kind":@"files",@"content":content})==-1,"reject missing file");
            require(pb.changeCount==ownedCount,"preserve clipboard on failed file copy");
            printf("Accessibility permission: %s\n",copyy_trusted()?"granted":"not granted (no permission changed)");
        } @catch(NSException *e) { fprintf(stderr,"FAIL %s\n",e.reason.UTF8String);result=1; }
        @finally {
            if(pb.changeCount==ownedCount) { [pb clearContents];if(original.count) [pb writeObjects:original]; }
            [[NSFileManager defaultManager] removeItemAtPath:file error:nil];
        }
        return result;
    }
}
