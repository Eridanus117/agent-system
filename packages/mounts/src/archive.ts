// 归档读取：按魔数识别 zip / gzip / tar，把成员展开成 (路径, 字节) 供公共面评估器递归扫描。
// 识别只看内容不看扩展名，改名的压缩包同样会被打开；认不出或解不开的归档由调用方按 fail-closed 处理。
import { gunzipSync, inflateRawSync } from "node:zlib";

export type ArchiveKind = "zip" | "gzip" | "tar";

export interface ArchiveMember {
  path: string;
  /** tar 里的符号链接成员也要暴露给评估器，让它按 symlink 拒绝。 */
  kind: "file" | "symlink" | "other";
  bytes: Uint8Array;
}

export class ArchiveError extends Error {}

/** 按魔数判断归档类型；不是归档返回 null。 */
export function detectArchive(bytes: Uint8Array): ArchiveKind | null {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06)) {
    return "zip";
  }
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "gzip";
  if (bytes.length >= 262 && bytes[257] === 0x75 && bytes[258] === 0x73 && bytes[259] === 0x74 && bytes[260] === 0x61 && bytes[261] === 0x72) {
    return "tar";
  }
  return null;
}

/** 展开一层归档；嵌套归档由调用方递归处理。 */
export function readArchive(kind: ArchiveKind, bytes: Uint8Array): ArchiveMember[] {
  switch (kind) {
    case "zip":
      return readZip(bytes);
    case "gzip":
      return readGzip(bytes);
    case "tar":
      return readTar(bytes);
  }
}

function readGzip(bytes: Uint8Array): ArchiveMember[] {
  let inflated: Uint8Array;
  try {
    inflated = new Uint8Array(gunzipSync(bytes));
  } catch (error) {
    throw new ArchiveError(`gzip 解压失败：${(error as Error).message}`);
  }
  // 解压结果自身可能还是 tar / zip；交给评估器按嵌套深度递归判断。
  return [{ path: "(gunzip)", kind: "file", bytes: inflated }];
}

function readTar(bytes: Uint8Array): ArchiveMember[] {
  const members: ArchiveMember[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = cString(header.subarray(0, 100), decoder);
    const size = parseInt(cString(header.subarray(124, 136), decoder).trim() || "0", 8);
    const typeflag = header[156] ?? 0x30;
    const prefix = cString(header.subarray(345, 500), decoder);
    const fullName = prefix ? `${prefix}/${name}` : name;
    if (Number.isNaN(size) || size < 0 || offset + 512 + size > bytes.length) {
      throw new ArchiveError(`tar 成员 ${fullName} 的大小字段不可信`);
    }
    const data = bytes.subarray(offset + 512, offset + 512 + size);
    if (typeflag === 0x30 || typeflag === 0x00) {
      members.push({ path: fullName, kind: "file", bytes: data });
    } else if (typeflag === 0x32) {
      members.push({ path: fullName, kind: "symlink", bytes: data });
    } else if (typeflag === 0x35) {
      // 目录条目没有内容，跳过即可。
    } else if (typeflag === 0x4c || typeflag === 0x4b || typeflag === 0x78 || typeflag === 0x67) {
      // GNU 长名与 PAX 扩展头会改写后续条目的名字；V1 不实现，按不可读处理，不猜。
      throw new ArchiveError(`tar 含未支持的扩展头（typeflag ${typeflag}）`);
    } else {
      members.push({ path: fullName, kind: "other", bytes: data });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return members;
}

function cString(bytes: Uint8Array, decoder: TextDecoder): string {
  const end = bytes.indexOf(0);
  return decoder.decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function readZip(bytes: Uint8Array): ArchiveMember[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 从尾部找 End of Central Directory（注释最长 65535 字节）。
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveError("zip 缺少 End of Central Directory");
  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) throw new ArchiveError("zip64 不支持");
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const members: ArchiveMember[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new ArchiveError("zip 中央目录损坏");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if ((flags & 0x1) !== 0) throw new ArchiveError(`zip 成员 ${name} 已加密`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new ArchiveError("zip64 不支持");
    if (name.endsWith("/")) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new ArchiveError(`zip 成员 ${name} 的本地头损坏`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) throw new ArchiveError(`zip 成员 ${name} 越界`);
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      try {
        data = new Uint8Array(inflateRawSync(compressed));
      } catch (error) {
        throw new ArchiveError(`zip 成员 ${name} 解压失败：${(error as Error).message}`);
      }
    } else {
      throw new ArchiveError(`zip 成员 ${name} 使用未支持的压缩方法 ${method}`);
    }
    members.push({ path: name, kind: "file", bytes: data });
  }
  return members;
}
