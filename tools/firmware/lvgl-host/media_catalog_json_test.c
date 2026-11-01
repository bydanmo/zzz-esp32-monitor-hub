#include "media_catalog.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
bool animation_preferences_storage_load(uint8_t value[ANIMATION_PREFERENCES_BYTES]){(void)value;return false;}
bool animation_preferences_storage_save(const uint8_t value[ANIMATION_PREFERENCES_BYTES]){(void)value;return true;}

static const char valid[]="{\"schemaVersion\":1,\"revision\":19,\"background\":{\"bytes\":307200,\"crc\":2826825260,\"remote\":\"/api/animations/assets/background/frames\"},\"entries\":["
"{\"id\":\"aaaaaaaaaaaaaaaa\",\"label\":\"CLIP A\",\"width\":198,\"height\":150,\"x\":145,\"y\":82,\"fps\":30,\"bytes\":7128000,\"crc\":4217330320,\"remote\":\"/api/animations/assets/aaaaaaaaaaaaaaaa/frames\"},"
"{\"id\":\"bbbbbbbbbbbbbbbb\",\"label\":\"CLIP B\",\"width\":198,\"height\":150,\"x\":145,\"y\":82,\"fps\":30,\"bytes\":4276800,\"crc\":2567760620,\"remote\":\"/api/animations/assets/bbbbbbbbbbbbbbbb/frames\"}]}";
int main(int argc,char **argv)
{
    media_clip_t clips[MEDIA_CATALOG_MAX];unsigned count=0;uint32_t crc=0;
    assert(media_catalog_decode(valid,clips,&count,&crc)&&count==2&&crc==2826825260u);
    assert(clips[0].crc==4217330320u&&clips[1].crc==2567760620u);
    char bad[sizeof(valid)];memcpy(bad,valid,sizeof(valid));
    for(char *id=strstr(bad,"bbbbbbbbbbbbbbbb");id;id=strstr(id+16,"bbbbbbbbbbbbbbbb"))memcpy(id,"aaaaaaaaaaaaaaaa",16);
    assert(!media_catalog_decode(bad,clips,&count,&crc));assert(count==2&&crc==2826825260u);
    memcpy(bad,valid,sizeof(valid));char *width=strstr(bad,"\"width\":198");assert(width);width[8]='4';
    assert(!media_catalog_decode(bad,clips,&count,&crc));
    assert(!media_catalog_decode("{}",clips,&count,&crc));
    assert(!media_catalog_decode("{",clips,&count,&crc));
    assert(!media_catalog_decode(NULL,clips,&count,&crc));
    if(argc==2){FILE *file=fopen(argv[1],"rb");assert(file);char json[8193];size_t size=fread(json,1,8192,file);fclose(file);assert(size<8192);json[size]=0;
        assert(media_catalog_decode(json,clips,&count,&crc));printf("Live Hub manifest decoded: %u entries, background CRC32=%08x\n",count,(unsigned)crc);}
    puts("Catalog JSON: unsigned CRCs, duplicate rejection, bounds, invalid input and unpublished metadata checks passed");
    return 0;
}
