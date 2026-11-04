import { existsSync, promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";

import { checkMiniApp, formatCheck, MANIFEST_FILE } from "../check/check";
import { UserError } from "../lib/errors";
import { getLocalix } from "../localix/get-localix";
import { installIntoLocalix } from "../localix/install";
import { assemblePackage } from "../package/assemble";
import { packIntoMarketplace } from "../package/pack";
import { formatVerdict, validatePackage } from "../package/validate";
import { WORKFLOW_FILE, writeReleaseSetup } from "../publish/ci";
import { drawIcon } from "../scaffold/icon";
import { isLucideName, lucideGlyph } from "../scaffold/lucide";
import { agentInstruction } from "../scaffold/prose";
import { APP_LAYER_API_VERSION } from "../kit/kit";
import { MINI_APP_NAME_RE, scaffoldMiniApp, toMiniAppName } from "../scaffold/scaffold";
import { stringOption } from "./args";
import { type CliContext, type Command, folder, readManifest } from "./context";
import { apiCommand } from "./api-command";
import { docCommand } from "./doc-command";
import { kitInfo, sayContractDiffers } from "./kit-command";
import { testCommand } from "./test-command";
import { buildPackage } from "./build-package";
import { marketplaceCommand } from "./marketplace-command";
import { keygen, signCommand } from "./signing-commands";

export type { CliContext } from "./context";

const create: Command = async (args, context) => {
  const raw = args.positional[0];
  if (!raw) throw new UserError('Name the mini app: mini-app create <name> --description "…"');
  const name = MINI_APP_NAME_RE.test(raw) ? raw : toMiniAppName(raw);
  const dir = resolve(context.cwd, stringOption(args, "dir") ?? name);
  const { kit } = await context.kit();
  if ((kit.manifest.apiVersion ?? 0) < APP_LAYER_API_VERSION) {
    throw new UserError(
      `This Localix (mini app API ${kit.manifest.apiVersion ?? "unknown"}) is older than this plugin, which needs API ${APP_LAYER_API_VERSION}: update Localix — \`mini-app get-localix\` installs the latest — then create the app again.`,
    );
  }
  const created = await scaffoldMiniApp({
    kit,
    dir,
    name,
    ...(stringOption(args, "title") ? { displayName: stringOption(args, "title")! } : {}),
    ...(stringOption(args, "description")
      ? { description: stringOption(args, "description")! }
      : {}),
  });
  context.out(`Created ${created.displayName} (${name}) at ${dir}.`);
  // The new app keeps its own kit, which the agent then reads in the app's folder.
  const { kit: appKit } = await context.kit(dir);
  if (args.options["no-check"] !== true) {
    // The fresh copy is checked once, so the agent starts from a mini app known to build.
    const { report } = await checkMiniApp({
      kit: appKit,
      miniAppDir: dir,
      allowTemplateResidue: true,
      ...(context.runTests ? { runTests: context.runTests } : {}),
    });
    context.out(formatCheck(name, report, { freshCopy: true }));
  }
  context.out(agentInstruction({ ...created, kit: appKit }));
  return 0;
};

const check: Command = async (args, context) => {
  const dir = folder(args, context);
  const { kit } = await context.kit();
  const manifest = await readManifest(dir);
  const { report } = await checkMiniApp({
    kit,
    miniAppDir: dir,
    // The template itself: the domain names a copy must replace are its own.
    ...(args.options.template === true ? { allowTemplateResidue: true } : {}),
    ...(context.runTests ? { runTests: context.runTests } : {}),
  });
  context.out(
    args.options.json === true
      ? JSON.stringify(report, null, 2)
      : formatCheck(typeof manifest.name === "string" ? manifest.name : dir, report, {
          template: args.options.template === true,
        }),
  );
  if (args.options.json !== true) await sayContractDiffers(kit, context);
  // The template passes with its own names in place; every other step still has to.
  const passed =
    args.options.template === true
      ? report.steps.every((step) => step.ok || step.title === "template residue")
      : report.ok;
  return passed ? 0 : 1;
};

const build: Command = async (args, context) => {
  const built = await buildPackage(folder(args, context), context);
  if (!built) return 1;
  context.out(`Package: ${built.packageDir}`);
  return 0;
};

const install: Command = async (args, context) => {
  const dir = folder(args, context);
  const built = await buildPackage(dir, context);
  if (!built) return 1;
  const installed = await installIntoLocalix(built.packageDir, dir, context.localix);
  context.out(`Installed ${installed.name} ${installed.version} into Localix and switched it on.`);
  for (const warning of installed.warnings) context.out(`- warning: ${warning}`);
  return 0;
};

const pack: Command = async (args, context) => {
  const dir = folder(args, context);
  const manifest = await readManifest(dir);
  const author =
    typeof manifest.author === "string"
      ? manifest.author
      : (manifest.author as { name?: string } | undefined)?.name;
  const publisher = stringOption(args, "publisher") ?? author;
  if (!publisher) {
    throw new UserError(
      `Name the publisher people will see: --publisher "<name>", or "author" in ${MANIFEST_FILE}.`,
    );
  }
  const built = await buildPackage(dir, context);
  if (!built) return 1;
  const outDir = resolve(
    context.cwd,
    stringOption(args, "out") ?? join(dir, "dist", "marketplace"),
  );
  const { kit } = await context.kit();
  const entry = await packIntoMarketplace({ kit, packageDir: built.packageDir, outDir, publisher });
  const release = kit.tools.marketplace.releaseFile;
  context.out(
    [
      `Packed ${entry.name} ${entry.version} into ${join(outDir, release)}.`,
      `Upload every file in ${outDir} to one place (a GitHub release, a site); people add the address of ${release} there, or the GitHub repository whose latest release carries it, in Localix: Store → Sources → Add source.`,
    ].join("\n"),
  );
  return 0;
};

const validate: Command = async (args, context) => {
  const path = folder(args, context);
  const { kit } = await context.kit();
  const verdict = await validatePackage(kit, path);
  context.out(
    args.options.json === true ? JSON.stringify(verdict, null, 2) : formatVerdict(path, verdict),
  );
  return verdict.ok ? 0 : 1;
};

const icon: Command = async (args, context) => {
  const dir = folder(args, context);
  const manifest = await readManifest(dir);
  const glyph = stringOption(args, "glyph");
  if (!glyph) {
    throw new UserError(
      "Give the glyph: mini-app icon [folder] --glyph <lucide-name> (house, chart-column), or '<path d=\"…\"/>', or a 24×24 .svg file.",
    );
  }
  const markup = glyph.trimStart().startsWith("<")
    ? glyph
    : isLucideName(glyph) && !existsSync(resolve(context.cwd, glyph))
      ? await lucideGlyph((await context.kit(dir)).kit.dir, glyph)
      : await fs.readFile(resolve(context.cwd, glyph), "utf8").catch(() => {
          throw new UserError(`Cannot read the glyph file ${glyph}.`);
        });
  const named = typeof manifest.icon === "string" && manifest.icon.endsWith(".svg");
  const target = resolve(dir, named ? (manifest.icon as string) : "icon.svg");
  if (relative(dir, target).startsWith("..")) {
    throw new UserError(`The manifest's icon ${String(manifest.icon)} is outside the mini app.`);
  }
  await fs.writeFile(target, drawIcon(markup, stringOption(args, "tint")));
  if (!named) {
    await fs.writeFile(
      join(dir, MANIFEST_FILE),
      `${JSON.stringify({ ...manifest, icon: "./icon.svg" }, null, 2)}\n`,
    );
  }
  context.out(`Drew ${relative(dir, target)}: the glyph on the store tile.`);
  return 0;
};

/** Set the app up to be released by GitHub Actions from its repository. */
const ci: Command = async (args, context) => {
  const dir = folder(args, context);
  const manifest = await readManifest(dir);
  const publisher = stringOption(args, "publisher");
  if (!publisher && !manifest.author) {
    throw new UserError(
      `Name the publisher people will see: --publisher "<name>" (kept as "author" in ${MANIFEST_FILE}).`,
    );
  }
  const { kit } = await context.kit();
  const pin = await writeReleaseSetup({
    dir,
    manifest,
    manifestFile: MANIFEST_FILE,
    localixVersion: kit.manifest.localixVersion,
    publisher,
    repository: stringOption(args, "repository"),
  });
  const version = typeof manifest.version === "string" ? manifest.version : "<version>";
  context.out(
    [
      `Wrote ${WORKFLOW_FILE}: every push and pull request is checked, and a tag v<version> releases the app — built with the kit of Localix ${pin.ref}.`,
      `Release: commit and push, then \`git tag v${version} && git push origin v${version}\`. People add <owner>/<repo> in Localix: Store → Sources → Add source.`,
    ].join("\n"),
  );
  return 0;
};

const getLocalixCommand: Command = async (_args, context) => {
  const got = await getLocalix(context.installer);
  context.out(
    got.existing
      ? `Localix is already installed at ${got.path}; opened it.`
      : `Installed the latest Localix at ${got.path} and opened it.`,
  );
  return 0;
};

export const HELP = `mini-app — create, check, build, install and share Localix mini apps.

  mini-app create <name> [--title "…"] [--description "…"] [--dir <folder>] [--no-check]
  mini-app check [folder] [--json] [--template]   every gate Localix applies, in one report
  mini-app test [folder] [files…]        run the app's tests alone, as check runs them
  mini-app api [module [export] | word]  the kit's API: a module's exports with their types, or names found
  mini-app doc [topic|example[/file]]   how to build an app: the build skill, a reference, or a working example
  mini-app build [folder]                check, then write the package to <folder>/dist/package
  mini-app install [folder]              build, then install into the running Localix
  mini-app pack [folder] [--out <dir>] [--publisher "…"]   add the app to a releasable marketplace
  mini-app validate <package folder | .tar.gz> [--json]
  mini-app icon [folder] --glyph <lucide-name | '<path …/>' | file.svg> [--tint #hex]   draw the app's icon
  mini-app marketplace validate [file] [--fetch] [--curation]   check a .localix-mini-app/marketplace.json
  mini-app marketplace build [file] [--out <dir>] [--curation]   pack its folders' apps into a release with its links
  mini-app ci [folder] [--publisher "…"] [--repository <owner>/<repo>]   release it from GitHub: a workflow that checks and releases tags
  mini-app keygen                        make your signing key, once (kept in ~/.config/localix)
  mini-app sign [folder] [--next-key <key>]   sign a packed marketplace: MINI_APP_SIGNING_KEY, else your key
  mini-app kit [folder] [--update [--version <v>|latest]]   the kit the app builds with; --update installs a release's
  mini-app get-localix                   install the latest Localix (verified) and open it

The folder defaults to the current one. The kit comes from MINI_APP_KIT, else the one installed in
the app's node_modules, else the running Localix's release (the latest one without it), which is
downloaded, verified and installed into the app.`;

export const COMMANDS: Record<string, Command> = {
  create,
  check,
  test: testCommand,
  api: apiCommand,
  doc: docCommand,
  build,
  install,
  pack,
  validate,
  icon,
  ci,
  keygen,
  sign: signCommand,
  kit: kitInfo,
  "get-localix": getLocalixCommand,
  marketplace: marketplaceCommand,
};
