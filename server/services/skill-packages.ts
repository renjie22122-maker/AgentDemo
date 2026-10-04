import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { parseSkill } from './skills.js';
import { Store, id } from '../storage/store.js';
import { assert } from '../core/errors.js';
type File = { path: string; bytes: Buffer };
async function snapshot(directory: string) {
  const root = resolve(directory),
    files: File[] = [];
  let count = 0,
    size = 0;
  assert(
    (await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(),
    'PACKAGE_ROOT',
    'Choose a real directory.',
  );
  async function walk(path: string, depth: number) {
    assert(depth <= 16, 'PACKAGE_DEPTH', 'Package nesting exceeds 16.');
    for (const entry of await readdir(path, { withFileTypes: true })) {
      assert(++count <= 10000, 'PACKAGE_ENTRIES', 'Package exceeds 10000 entries.');
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(entry.name))
        continue;
      assert(
        !entry.isSymbolicLink(),
        'PACKAGE_LINK',
        'Linked files are not supported in packages.',
      );
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target, depth + 1);
      else if (entry.isFile()) {
        const stat = await lstat(target);
        assert(stat.size + size <= 32 * 1024 * 1024, 'PACKAGE_SIZE', 'Package exceeds 32 MiB.');
        const bytes = await readFile(target);
        size += bytes.length;
        assert(size <= 32 * 1024 * 1024, 'PACKAGE_SIZE', 'Package exceeds 32 MiB.');
        files.push({ path: relative(root, target).replaceAll('\\', '/'), bytes });
      }
    }
  }
  await walk(root, 0);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const signatureFile = files.find((f) => f.path === 'agentdemo-signature.json');
  const payload = files.filter((f) => f !== signatureFile);
  const inventory = payload.map((f) => ({
    path: f.path,
    bytes: f.bytes.length,
    sha256: createHash('sha256').update(f.bytes).digest('hex'),
  }));
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
  const skills = payload
    .filter((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))
    .map((f) => ({ path: f.path, ...parseSkill(f.bytes.toString('utf8')) }));
  assert(skills.length > 0, 'PACKAGE_SKILLS', 'No valid skills found.');
  return {
    root,
    files: payload,
    inventory,
    digest,
    skills,
    signature: signatureFile ? JSON.parse(signatureFile.bytes.toString('utf8')) : undefined,
  };
}
export class SkillPackages {
  constructor(
    private store: Store,
    private directory: string,
  ) {}
  async preview(path: string, publicKey?: string) {
    const snap = await snapshot(path);
    let signature = 'unsigned',
      keyFingerprint: string | undefined;
    if (snap.signature) {
      signature = 'untrusted-key';
      if (publicKey) {
        const key = createPublicKey(publicKey);
        assert(key.asymmetricKeyType === 'ed25519', 'PACKAGE_KEY', 'Use an Ed25519 public key.');
        keyFingerprint = createHash('sha256')
          .update(key.export({ format: 'der', type: 'spki' }))
          .digest('hex');
        assert(
          verify(
            null,
            Buffer.from(snap.digest, 'hex'),
            key,
            Buffer.from(snap.signature.signature || '', 'base64'),
          ),
          'PACKAGE_SIGNATURE',
          'Invalid package signature.',
        );
        signature = 'verified-user-key';
      }
    }
    return {
      source: snap.root,
      digest: snap.digest,
      files: snap.inventory,
      signature,
      keyFingerprint,
      skills: snap.skills.map((s) => ({
        path: s.path,
        name: s.name,
        description: s.description,
        manifest: s.manifest,
      })),
      compatibility: {
        format: 'SKILL.md',
        scriptsExecuted: false,
        dependencyStatus: 'declared-only; prepare and verify in task environment',
      },
      notices: [
        'Hidden/build folders excluded.',
        'No package code is executed.',
        'New and upgraded revisions start disabled.',
      ],
    };
  }
  async install(path: string, expectedDigest: string, publicKey?: string) {
    const preview = await this.preview(path, publicKey),
      snap = await snapshot(path);
    assert(
      preview.digest === expectedDigest && snap.digest === expectedDigest,
      'PACKAGE_CHANGED',
      'Package changed since preview. Review again.',
    );
    assert(
      preview.signature !== 'untrusted-key',
      'PACKAGE_SIGNATURE',
      'Provide the trusted publisher public key before installing a signed package.',
    );
    const packageId = createHash('sha256')
      .update(process.platform === 'win32' ? snap.root.toLowerCase() : snap.root)
      .digest('hex');
    const old = this.store.maybe<any>('skill-package', packageId);
    if (old?.digest === snap.digest && !old.removed) {
      assert(
        (await snapshot(join(this.directory, packageId, snap.digest))).digest === snap.digest,
        'PACKAGE_CHANGED',
        'Installed package changed. Review its files before reuse.',
      );
      return { ...old, unchanged: true };
    }
    const versionPath = join(this.directory, packageId, snap.digest);
    await mkdir(versionPath, { recursive: true });
    for (const f of snap.files) {
      const destination = join(versionPath, f.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, f.bytes);
    }
    const prior = old?.skillIds?.map((key: string) => this.store.get<any>('skill', key)) || [];
    const values = snap.skills.map((s) => ({
      id: id(),
      name: s.name,
      description: s.description,
      content: s.content,
      manifest: s.manifest,
      source: join(versionPath, s.path),
      sourceGroup: 'Managed package',
      enabled: false,
      createdAt: Date.now(),
    }));
    const record = {
      id: packageId,
      source: snap.root,
      digest: snap.digest,
      signature: preview.signature,
      keyFingerprint: preview.keyFingerprint,
      skillIds: values.map((s) => s.id),
      revisions: [...(old?.revisions || []), { digest: snap.digest, skills: values }],
      updatedAt: Date.now(),
      removed: false,
    };
    this.store.transaction(() => {
      for (const s of prior) this.store.put('skill', { ...s, enabled: false });
      for (const s of values) this.store.put('skill', s);
      this.store.put('skill-package', record);
    });
    return record;
  }
  async setRevision(packageId: string, digest?: string) {
    const pkg = this.store.get<any>('skill-package', packageId);
    const revision = digest ? pkg.revisions.find((r: any) => r.digest === digest) : undefined;
    assert(!digest || revision, 'PACKAGE_REVISION', 'Unknown package revision.');
    if (revision)
      assert(
        (await snapshot(join(this.directory, packageId, digest!))).digest === digest,
        'PACKAGE_CHANGED',
        'Stored revision changed. Restore reviewed bytes before rollback.',
      );
    this.store.transaction(() => {
      for (const r of pkg.revisions)
        for (const s of r.skills) {
          const current = this.store.maybe<any>('skill', s.id);
          if (current) this.store.put('skill', { ...current, enabled: false });
        }
      if (revision)
        for (const s of revision.skills) this.store.put('skill', { ...s, enabled: false });
      this.store.put('skill-package', {
        ...pkg,
        digest: digest || pkg.digest,
        skillIds: revision?.skills.map((s: any) => s.id) || [],
        removed: !digest,
        updatedAt: Date.now(),
      });
    });
    return { ok: true, enabled: false, filesDeleted: false };
  }
  list() {
    return this.store.list<any>('skill-package');
  }
}
