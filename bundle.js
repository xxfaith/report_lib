// src/github.ts
import SysFetch from "@system.fetch";
import SysCipher from "@system.cipher";
import SysMasDevice from "@system.mas.device";
import SysLaunch from "@system.launch";
import SysStorage from "@system.storage";
var host = [
  "https://whois.pconline.com.cn/ipJson.jsp?json=true",
  "https://cdid.c-ctrip.com/model-poc2/h",
  "https://vv.video.qq.com/checktime?otype=ojson",
  "https://g3.letv.com/r?format=1",
  "https://r.inews.qq.com/api/ip2city",
  "https://myip.ipip.net/json",
  "https://i.news.qq.com/api/ip2city",
  "https://ipv4.gdt.qq.com/get_client_ip"
];
async function getIP(index) {
  if (index >= host.length) return "";
  return SysFetch.fetch({
    url: host[index]
  }).then(
    (res) => {
      try {
        const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
        const ips = res.data.match(ipRegex) || [];
        if (ips.length) return ips[0];
        return getIP(index + 1);
      } catch (err) {
        return getIP(index + 1);
      }
    },
    (_) => {
      return getIP(index + 1);
    }
  ).catch((error) => {
    console.warn(error);
    return getIP(index + 1);
  });
}
function checkProject(token, vendorId) {
  return SysFetch.fetch({
    url: `https://api.github.com/repos/xxfaith/${vendorId}`,
    header: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "repo-checker"
    }
  });
}
function getFileSha(token, info) {
  return SysFetch.fetch({
    url: `https://api.github.com/repos/xxfaith/${info.vendor}/contents/${info.uuid}_${info.mac}.json`,
    responseType: "json",
    method: "GET",
    header: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "file-creator",
      "Content-Type": "application/json",
      Host: "api.github.com"
    }
  }).then(
    (res) => {
      if (!res.data.content)
        return {
          content: JSON.stringify({}),
          sha: res.data.sha
        };
      return SysCipher.base64Decode(res.data.content).then((buf) => {
        const uint8Array = new Uint8Array(buf);
        let decodedData = "";
        for (let i = 0; i < uint8Array.length; i++) {
          decodedData += String.fromCharCode(uint8Array[i]);
        }
        return {
          content: decodedData,
          sha: res.data.sha
        };
      });
    },
    (err) => {
      console.warn(err);
      return {
        content: JSON.stringify({}),
        sha: ""
      };
    }
  );
}
function updateFile(token, fileSha, info) {
  return SysCipher.base64Encode(JSON.stringify(info)).then((content) => {
    return SysFetch.fetch({
      url: `https://api.github.com/repos/xxfaith/${info.vendor}/contents/${info.uuid}_${info.mac}.json`,
      method: "PUT",
      header: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": fileSha ? "file-upsert" : "file-creator",
        "Content-Type": "application/json",
        Host: "api.github.com"
      },
      data: {
        message: "update",
        content,
        sha: fileSha
      }
    });
  });
}
function reportOfficeServer(info) {
  return SysFetch.fetch({
    url: "http://120.26.107.114/api/production/activate",
    method: "POST",
    responseType: "json",
    // @ts-ignore
    headers: {
      "Content-Type": "application/json"
    },
    data: info
  });
}
function reportGithub(token, info) {
  return getFileSha(token, info).then((fileInfo) => {
    return getIP(0).then((ip) => {
      const uploadDateInfo = {};
      const fileJson = JSON.parse(fileInfo.content);
      if (fileJson["createdAt"]) {
        uploadDateInfo["createdAt"] = fileJson["createdAt"];
      } else {
        uploadDateInfo["createdAt"] = (/* @__PURE__ */ new Date()).getTime();
      }
      uploadDateInfo["updatedAt"] = (/* @__PURE__ */ new Date()).getTime();
      return updateFile(token, fileInfo.sha, {
        ...info,
        ip,
        ...uploadDateInfo
      });
    });
  });
}
function report(token) {
  SysMasDevice.getInfo().then((res) => {
    if (res.code !== 200) {
      console.info("get device info failed");
      SysLaunch.exit();
      return;
    }
    const deviceInfo = JSON.parse(res.data);
    let vendorId = deviceInfo["vendorId"] >> 16 & 65535;
    let productId = deviceInfo["vendorId"] & 65535;
    if (deviceInfo["manu"] === "huamei" && deviceInfo["vendorId"] === 0) {
      vendorId = 264;
      productId = 1;
    }
    const info = {
      vendor: vendorId,
      production_id: productId,
      mac: deviceInfo["mac"],
      uuid: deviceInfo["uuid"],
      runtime_version: deviceInfo["runtimeVersion"],
      nucleus_version: deviceInfo["nucleusVersion"],
      sdk_info: deviceInfo["sdk_info"]
    };
    const storageKey = `${vendorId}_${productId}_${info.mac}_${info.uuid}`;
    const uploadStorage = SysStorage.get(storageKey);
    if (uploadStorage && uploadStorage.office) return;
    return reportOfficeServer(info).then(
      (res2) => {
        if (res2.data.code !== 0) {
          return reportGithub(token, info);
        } else {
          SysStorage.set(storageKey, { office: true });
        }
      },
      () => {
        return reportGithub(token, info);
      }
    );
  }).finally(() => {
    SysLaunch.exit();
  });
}
export {
  checkProject,
  getFileSha,
  getIP,
  report,
  updateFile
};
//# sourceMappingURL=bundle.js.map
