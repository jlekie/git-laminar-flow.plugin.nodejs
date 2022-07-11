import * as _ from 'lodash';
import * as Path from 'path';
import * as FS from 'fs-extra';
import * as Zod from 'zod';

import { PluginHandler } from '@jlekie/git-laminar-flow-cli';

const OptionsSchema = Zod.object({
    packagePath: Zod.string(),
    workspace: Zod.object({
        includedTags: Zod.string().array().array().default([]),
        excludedTags: Zod.string().array().array().default([])
    }).default({})
});

const NpmPackageSchema = Zod.object({
    name: Zod.string().optional(),
    version: Zod.string().optional(),
    workspaces: Zod.string().array().optional()
}).passthrough();

const createPlugin: PluginHandler = (options) => {
    const parsedOptions = OptionsSchema.parse(options);

    return {
        init: async ({ config, stdout, dryRun }) => {
            const npmPackagePath = Path.resolve(config.path, parsedOptions.packagePath);
            const npmProjectPath = Path.dirname(npmPackagePath)
            const npmPackage = await FS.readJson(npmPackagePath).then(NpmPackageSchema.parse);

            npmPackage.workspaces = [];

            const workspacePaths = _(config.submodules).map(submodule => {
                const submodulePath = submodule.resolvePath();
                const tags = submodule.resolveTags();

                if (parsedOptions.workspace.includedTags.some(itg => itg.every(it => tags.some(t => t === it))) && !parsedOptions.workspace.excludedTags.some(etg => etg.every(et => tags.some(t => t === et))) && !npmPackage.workspaces?.some(w => Path.resolve(npmProjectPath, w) === submodulePath))
                    return Path.relative(npmProjectPath, submodulePath).replace('\\', '/');
            }).compact().value();

            if (!dryRun && workspacePaths.length) {
                npmPackage.workspaces = npmPackage.workspaces ?? [];
                npmPackage.workspaces.push(...workspacePaths);

                await FS.writeJson(npmPackagePath, npmPackage, {
                    spaces: 2
                });
                stdout?.write(`Updated package file written to ${npmPackagePath}\n`);
            }

            if (!config.parentConfig)
                await config.exec('yarn install', { stdout, dryRun })
        },
        updateVersion: async (oldVersion, newVersion, { config, stdout, dryRun }) => {
            const npmPackagePath = Path.resolve(config.path, parsedOptions.packagePath);
            const npmPackage = await FS.readJson(npmPackagePath).then(NpmPackageSchema.parse);

            npmPackage.version = newVersion;

            if (!dryRun) {
                await FS.writeJson(npmPackagePath, npmPackage, {
                    spaces: 2
                });
                stdout?.write(`Updated package file written to ${npmPackagePath}\n`);
            }
        }
    }
}

export default createPlugin;
