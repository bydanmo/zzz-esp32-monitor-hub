#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "crt_clock.h"

int main(int argc,char **argv)
{
    uint32_t seconds=0;
    assert(crt_clock_parse("2026-10-26T14:20:30.123Z",&seconds) && seconds==22*3600+20*60+30);
    assert(crt_clock_parse("2026-10-26T16:00:00Z",&seconds) && seconds==0);
    assert(crt_clock_parse("2026-10-26T23:59:59Z",&seconds) && seconds==8*3600-1);
    assert(!crt_clock_parse("2026-10-26T24:01:00Z",&seconds));
    assert(!crt_clock_parse("2026-10-26T10:60:00Z",&seconds));
    assert(!crt_clock_parse("2026-10-26T10:00:60Z",&seconds));
    assert(!crt_clock_parse("2026-10-26T10:00:00+08:00",&seconds));
    assert(!crt_clock_parse("bad",&seconds));
    assert(!crt_clock_parse(NULL,&seconds));
    assert(crt_clock_seconds(86399,1000,3000)==1);
    assert(crt_clock_seconds(1234,1000,999)==1234);
    assert(crt_clock_seconds(1234,1000,1000+86400000LL)==1234);
    unsigned char background[480*320*2]={0};
    unsigned char guarded[CRT_CLOCK_WIDTH*CRT_CLOCK_HEIGHT*2+2];
    memset(guarded,0xAA,sizeof(guarded));
    crt_clock_render(guarded+1,background,23*3600+59*60,true);
    assert(guarded[0]==0xAA && guarded[sizeof(guarded)-1]==0xAA);
    if (argc==3) {
        FILE *source=fopen(argv[1],"rb");assert(source);
        assert(fread(background,1,sizeof(background),source)==sizeof(background));fclose(source);
        crt_clock_render(guarded+1,background,22*3600+28*60,true);
        for(int y=0;y<CRT_CLOCK_HEIGHT;++y) memcpy(background+((CRT_CLOCK_Y+y)*480+CRT_CLOCK_X)*2,
            guarded+1+y*CRT_CLOCK_WIDTH*2,CRT_CLOCK_WIDTH*2);
        FILE *out=fopen(argv[2],"wb");assert(out);fprintf(out,"P6\n480 320\n255\n");
        for(int p=0;p<480*320;++p) {
            unsigned v=(background[p*2]<<8)|background[p*2+1];
            unsigned char rgb[]={((v>>11)&31)*255/31,((v>>5)&63)*255/63,(v&31)*255/31};
            fwrite(rgb,1,3,out);
        }
        fclose(out);
    }
    puts("CRT clock: UTC+8, midnight rollover, invalid input, monotonic holdover, render bounds passed");
}
