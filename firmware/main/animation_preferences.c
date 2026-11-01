#include "animation_preferences.h"
#include <string.h>

static animation_preferences_t current;
static bool persisted;
bool animation_id_valid(const char *id)
{
    if (!id) return false;
    if (strcmp(id,"builtin")==0) return true;
    if (strlen(id)!=16) return false;
    for (int i=0;i<16;i++) if (!((id[i]>='a'&&id[i]<='f')||(id[i]>='0'&&id[i]<='9'))) return false;
    return true;
}
static uint32_t checksum(const uint8_t *value)
{
    uint32_t result=2166136261u;
    for (int i=0;i<20;i++) result=(result^value[i])*16777619u;
    return result;
}
void animation_preferences_init(void)
{
    current=(animation_preferences_t){"builtin",ANIMATION_SINGLE};persisted=false;
    uint8_t value[ANIMATION_PREFERENCES_BYTES]={0};
    if (!animation_preferences_storage_load(value) || value[0]!=0xa7 || value[1]!=1 || value[2]>ANIMATION_SEQUENCE || value[19]!=0) return;
    uint32_t stored=0;for(int i=0;i<4;i++) stored|=(uint32_t)value[20+i]<<(8*i);
    if(stored!=checksum(value) || !animation_id_valid((char *)value+3)) return;
    memcpy(current.id,value+3,sizeof(current.id));current.mode=(animation_mode_t)value[2];persisted=true;
}
const animation_preferences_t *animation_preferences_get(void) { return &current; }
bool animation_preferences_select(const char *id,animation_mode_t mode)
{
    if (!animation_id_valid(id) || mode<ANIMATION_SINGLE || mode>ANIMATION_SEQUENCE) return false;
    if (persisted && current.mode==mode && strcmp(current.id,id)==0) return true;
    uint8_t value[ANIMATION_PREFERENCES_BYTES]={0xa7,1,(uint8_t)mode};
    memcpy(value+3,id,strlen(id));
    uint32_t sum=checksum(value);for(int i=0;i<4;i++) value[20+i]=(uint8_t)(sum>>(8*i));
    if (!animation_preferences_storage_save(value)) return false;
    memcpy(current.id,value+3,sizeof(current.id));current.mode=mode;persisted=true;
    return true;
}
