#pragma once
#include <stddef.h>
#include <stdint.h>

/* Partial draw buffers are completely rendered before each flush. Convert the
 * borrowed buffer in place, then keep it immutable until DMA completes. */
static inline void display_pixels_rgb565be(uint16_t *pixels,size_t count)
{
    for(size_t i=0;i<count;i++)pixels[i]=(uint16_t)((pixels[i]<<8)|(pixels[i]>>8));
}
