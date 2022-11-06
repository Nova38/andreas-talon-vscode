import { Range, TextDocument, TextEditor, window } from "vscode";
import { API, GitExtension, Remote, Repository } from "./typings/git";

let gitApi: API;

export const init = (gitExtension: GitExtension): void => {
    gitApi = gitExtension.getAPI(1);
};

export const getFileURL = (lineNumber: boolean): string => {
    const { document, selection } = getEditor();
    const filePath = getFilePath(document);
    const repository = getRepository(filePath);
    validateUnchangedDocument(document, repository);
    const platform = getPlatform(repository);

    return platform.getFileUrl(
        getCommit(repository),
        getRelativeFilepath(repository, filePath),
        lineNumber ? selection : undefined
    );
};

export const getRepoURL = (): string => {
    return getPlatformHelper().getRepoUrl();
};

export const getIssuesURL = (): string => {
    return getPlatformHelper().getIssuesUrl();
};

export const getNewIssueURL = (): string => {
    return getPlatformHelper().getNewIssueUrl();
};

export const getPullRequestsURL = (): string => {
    return getPlatformHelper().getPullRequestsURL();
};

function getPlatformHelper(): Platform {
    const { document } = getEditor();
    const filePath = getFilePath(document);
    const repository = getRepository(filePath);
    return getPlatform(repository);
}

function getRelativeFilepath(repository: Repository, filePath: string) {
    return filePath.substring(repository.rootUri.path.length + 1);
}

function getEditor(): TextEditor {
    const editor = window.activeTextEditor;
    if (!editor) {
        throw Error("Can't find active text editor");
    }
    return editor;
}

function getFilePath(document: TextDocument): string {
    const path = document.uri.path;
    if (!path) {
        throw Error("Can't find file path");
    }
    return path;
}

function validateUnchangedDocument(
    document: TextDocument,
    repository: Repository
) {
    if (document.uri.scheme !== "file") {
        throw Error("Document scheme is not file");
    }
    if (document.isDirty) {
        throw Error("Document contains unsaved changes");
    }

    const changes = [
        ...repository.state.workingTreeChanges,
        ...repository.state.indexChanges,
        ...repository.state.mergeChanges,
    ];
    const hasGitChange = changes.some((c) => c.uri.path === document.uri.path);
    if (hasGitChange) {
        throw Error("Document contains uncommitted git changes");
    }
}

const getRepository = (filePath: string): Repository => {
    const { repositories } = gitApi;
    if (repositories.length === 1) {
        return repositories[0];
    }
    const repository = repositories.find((r) =>
        filePath.toLowerCase().startsWith(r.rootUri.path.toLowerCase())
    );
    if (!repository) {
        throw Error("Can't find git repository");
    }
    return repository;
};

function getRemote(repository: Repository): Remote {
    const name = repository.state.HEAD?.upstream?.remote;
    const remote = repository.state.remotes.find((r) => r.name === name);
    if (!remote) {
        throw Error(`Can't find git remote '${name}'`);
    }
    return remote;
}

function getRemoteUrl(repository: Repository) {
    const remote = getRemote(repository);
    const url = remote.fetchUrl ?? remote.pushUrl;
    if (!url) {
        throw Error(`Remote '${remote.name}' has no fetch or push url`);
    }
    return url;
}

// function getBranch(repository: Repository): string {
//     const branch = repository.state.HEAD?.name;
//     if (!branch) {
//         throw Error("Can't find git branch");
//     }
//     return branch;
// }

function getCommit(repository: Repository): string {
    const commit = repository.state.HEAD?.commit;
    if (!commit) {
        throw Error("Can't find git commit");
    }
    return commit;
}

function cleanGitUrl(url: string) {
    if (url.startsWith("git@")) {
        url = url.replace(":", "/").replace("git@", "https://");
    }
    if (url.endsWith(".git")) {
        url = url.substring(0, url.length - 4);
    }
    return url;
}

function getPlatform(repository: Repository): Platform {
    const remoteUrl = getRemoteUrl(repository);
    if (remoteUrl.includes("github.com")) {
        return new Github(remoteUrl);
    }
    if (remoteUrl.includes("bitbucket.org")) {
        return new Bitbucket(remoteUrl);
    }
    throw Error(`Can't find git platform for remote url '${remoteUrl}'`);
}

interface Platform {
    name: string;
    getFileUrl(commitOrBranch: string, filePath: string, range?: Range): string;
    getRepoUrl(): string;
    getIssuesUrl(): string;
    getNewIssueUrl(): string;
    getPullRequestsURL(): string;
}

class Github implements Platform {
    name = "GitHub";
    repoUrl: string;

    constructor(remoteUrl: string) {
        this.repoUrl = cleanGitUrl(remoteUrl);
    }

    getFileUrl(
        commitOrBranch: string,
        filePath: string,
        range?: Range
    ): string {
        let url = `${this.repoUrl}/blob/${commitOrBranch}/${filePath}`;

        if (range != null) {
            url = range.isSingleLine
                ? `${url}#L${range.start.line + 1}`
                : `${url}#L${range.start.line + 1}-L${range.end.line + 1}`;
        }

        return url;
    }

    getRepoUrl(): string {
        return this.repoUrl;
    }

    getIssuesUrl(): string {
        return `${this.repoUrl}/issues`;
    }

    getNewIssueUrl(): string {
        return `${this.repoUrl}/issues/new`;
    }

    getPullRequestsURL(): string {
        return `${this.repoUrl}/pulls#`;
    }
}

class Bitbucket implements Platform {
    name = "Bitbucket";
    repoUrl: string;

    constructor(remoteUrl: string) {
        this.repoUrl = cleanGitUrl(remoteUrl);
    }

    getFileUrl(
        commitOrBranch: string,
        filePath: string,
        range?: Range
    ): string {
        let url = `${this.repoUrl}/src/${commitOrBranch}/${filePath}`;

        if (range != null) {
            url = range.isSingleLine
                ? `${url}#lines-${range.start.line + 1}`
                : `${url}#lines-${range.start.line + 1}:${range.end.line + 1}`;
        }

        return url;
    }

    getRepoUrl(): string {
        return this.repoUrl;
    }

    getIssuesUrl(): string {
        return `${this.repoUrl}/issues`;
    }

    getNewIssueUrl(): string {
        return `${this.repoUrl}/issues/new`;
    }

    getPullRequestsURL(): string {
        return `${this.repoUrl}/pull-requests`;
    }
}
