#include "crt_clock.h"
#include <stddef.h>
#include <string.h>

bool crt_clock_parse(const char *iso, uint32_t *seconds)
{
    if (!iso || !seconds) return false;
    size_t length = strlen(iso);
    if (length < 20 || iso[4] != '-' || iso[7] != '-' || iso[10] != 'T' ||
        iso[13] != ':' || iso[16] != ':' || iso[length-1] != 'Z') return false;
    for (size_t i=0; i<19; ++i) {
        if (i==4 || i==7 || i==10 || i==13 || i==16) continue;
        if (iso[i] < '0' || iso[i] > '9') return false;
    }
    if (length > 20) {
        if (iso[19] != '.' || length < 22) return false;
        for (size_t i=20; i<length-1; ++i) if (iso[i]<'0' || iso[i]>'9') return false;
    }
    unsigned h=(iso[11]-'0')*10+iso[12]-'0';
    unsigned m=(iso[14]-'0')*10+iso[15]-'0';
    unsigned s=(iso[17]-'0')*10+iso[18]-'0';
    if (h>23 || m>59 || s>59) return false;
    *seconds = ((h+8)*3600+m*60+s)%86400;
    return true;
}

uint32_t crt_clock_seconds(uint32_t anchor, int64_t received_ms, int64_t now_ms)
{
    uint64_t elapsed = now_ms > received_ms ? (uint64_t)(now_ms-received_ms)/1000 : 0;
    return (uint32_t)((anchor+elapsed)%86400);
}

static void pixel(uint8_t *pixels, int x, int y, uint16_t color)
{
    if (x<0 || x>=CRT_CLOCK_WIDTH || y<0 || y>=CRT_CLOCK_HEIGHT) return;
    size_t at=((size_t)y*CRT_CLOCK_WIDTH+x)*2;
    pixels[at]=(uint8_t)(color>>8); pixels[at+1]=(uint8_t)color;
}

void crt_clock_render(uint8_t *pixels, const uint8_t *background, uint32_t seconds, bool valid)
{
    for (int y=0; y<CRT_CLOCK_HEIGHT; ++y)
        memcpy(pixels+(size_t)y*CRT_CLOCK_WIDTH*2,
               background+((size_t)(CRT_CLOCK_Y+y)*480+CRT_CLOCK_X)*2, CRT_CLOCK_WIDTH*2);
    /* Follow the original clock's tilted glass, retaining its case and bezel. */
    for (int x=5; x<94; ++x)
        for (int y=14-(x-5)*12/89; y<=41-(x-5)*9/89; ++y)
            pixel(pixels,x,y,0x0843);
    static const uint16_t digits[] = {0x7B6F,0x2492,0x73E7,0x73CF,0x5BC9,
                                     0x79CF,0x79EF,0x7249,0x7BEF,0x7BCF};
    unsigned values[]={seconds/36000,(seconds/3600)%10,(seconds/600)%6,(seconds/60)%10};
    const int positions[]={11,30,57,76};
    for (int i=0; i<4; ++i) {
        uint16_t dots=valid ? digits[values[i]] : 0x01C0;
        for (int row=0; row<5; ++row) for (int col=0; col<3; ++col) {
            if (!(dots & (1u<<(14-row*3-col)))) continue;
            int x=positions[i]+col*4, y=19-x/8+row*4;
            pixel(pixels,x,y,0xF7B7); pixel(pixels,x+1,y,0xF7B7);
            pixel(pixels,x,y+1,0xF7B7); pixel(pixels,x+1,y+1,0xF7B7);
        }
    }
    if (valid && seconds%2==0) for (int row=0; row<2; ++row) {
        int y=18+row*8;
        pixel(pixels,48,y,0xF7B7);pixel(pixels,49,y,0xF7B7);
        pixel(pixels,48,y+1,0xF7B7);pixel(pixels,49,y+1,0xF7B7);
    }
}
