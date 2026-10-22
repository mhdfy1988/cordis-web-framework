const targetVersion = '4.0.0-rc.11';

// 补丁仅针对已复现和核对的发布包；升级必须显式重新评估。
export function assertCordisPatchTarget(declaredVersion, installedVersion) {
  if (declaredVersion !== targetVersion || installedVersion !== targetVersion) {
    throw new Error(`Cordis #133 补丁只支持 ${targetVersion}；清单=${declaredVersion}，安装包=${installedVersion}。请评审升级并移除或更新补丁，禁止误套。`);
  }
}
