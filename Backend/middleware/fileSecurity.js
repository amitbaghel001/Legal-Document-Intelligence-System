import fs from 'fs';

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const DANGEROUS_MAGIC_BYTES = [
  Buffer.from([0x4d, 0x5a]), // EXE/DLL (MZ)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]) // ELF
];

export function scanUploadedFile(filepath) {
  if (!filepath || !fs.existsSync(filepath)) {
    return { safe: false, reason: 'Uploaded file missing on server' };
  }

  const fileBuffer = fs.readFileSync(filepath);
  const firstBytes = fileBuffer.subarray(0, 8);
  const preview = fileBuffer.subarray(0, 4096).toString('utf8');

  if (preview.includes(EICAR_SIGNATURE)) {
    return { safe: false, reason: 'Malware signature detected (EICAR)' };
  }

  const hasDangerousBinary = DANGEROUS_MAGIC_BYTES.some((magic) =>
    firstBytes.subarray(0, magic.length).equals(magic)
  );
  if (hasDangerousBinary) {
    return { safe: false, reason: 'Executable binary payload detected' };
  }

  return { safe: true };
}

