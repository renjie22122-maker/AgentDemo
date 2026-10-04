// Inspect ISO BMFF track declarations, not perceived loudness or codec compatibility.
export function inspectMedia(bytes: Buffer, mime: string) {
  if (!['video/mp4', 'audio/mp4'].includes(mime))
    return { audio: 'unknown' as const, method: 'unsupported-container' };
  let audioTracks = 0,
    videoTracks = 0,
    foundMovie = false,
    boxes = 0;
  const scan = (start: number, end: number, depth: number) => {
    if (depth > 8) throw Error('depth');
    for (let at = start; at < end;) {
      if (++boxes > 100000 || at + 8 > end) throw Error('invalid box');
      let size = bytes.readUInt32BE(at),
        header = 8;
      const type = bytes.toString('ascii', at + 4, at + 8);
      if (size === 1) {
        if (at + 16 > end) throw Error('short extended box');
        const n = bytes.readBigUInt64BE(at + 8);
        if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('size');
        size = Number(n);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) throw Error('invalid size');
      if (type === 'moov' && depth === 0) {
        foundMovie = true;
        scan(at + header, at + size, 1);
      } else if (type === 'trak' && depth === 1) scan(at + header, at + size, 2);
      else if (type === 'mdia' && depth === 2) scan(at + header, at + size, 3);
      else if (type === 'hdlr' && depth === 3) {
        if (size < header + 12) throw Error('short handler');
        const handler = bytes.toString('ascii', at + header + 8, at + header + 12);
        if (handler === 'soun') audioTracks++;
        if (handler === 'vide') videoTracks++;
      }
      at += size;
    }
  };
  try {
    scan(0, bytes.length, 0);
    return {
      audio:
        foundMovie && (audioTracks || videoTracks)
          ? audioTracks
            ? 'present'
            : 'absent'
          : 'unknown',
      audioTracks,
      videoTracks,
      method: 'mp4-track-headers',
    };
  } catch {
    return { audio: 'unknown', method: 'invalid-or-incomplete-container' };
  }
}
export function mediaRange(header: string | undefined, length: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !length) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < length
    ? { start, end }
    : false;
}
