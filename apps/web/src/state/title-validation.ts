export const maxDisplayTitleCharacters = 12;
export const maxDisplayTitleBytes = 48;

const supportedChineseGlyphs =
  "监控屏连接中已在线重离正启刚更新数据延迟过期暂无异常等待考研倒计时" +
  "内存未用系统指标详情再次点击状态返回关闭没有可显示的请网页调整天目标间到" +
  "估算总览学习";

export function isSupportedDisplayTitleCharacter(character: string): boolean {
  return /^[\x20-\x7E]$/.test(character) || supportedChineseGlyphs.includes(character);
}

export function sanitizeDisplayTitle(value: string): string {
  return Array.from(value)
    .filter(isSupportedDisplayTitleCharacter)
    .slice(0, maxDisplayTitleCharacters)
    .join("");
}

export function displayTitleError(value: string): string | null {
  const title = value.trim();
  const characters = Array.from(title);
  if (characters.length === 0 || characters.length > maxDisplayTitleCharacters) {
    return `标题必须包含 1–${maxDisplayTitleCharacters} 个字符。`;
  }
  if (new TextEncoder().encode(title).length > maxDisplayTitleBytes) {
    return `标题的 UTF-8 长度不能超过 ${maxDisplayTitleBytes} 字节。`;
  }
  if (!characters.every(isSupportedDisplayTitleCharacter)) {
    return "标题包含设备字库尚未支持的字符。";
  }
  return null;
}
