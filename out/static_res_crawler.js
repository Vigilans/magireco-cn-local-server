"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawler = void 0;
const parameters = require("./parameters");
const http2 = require("http2");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
class crawler {
    constructor(params, localServer) {
        var _a, _b;
        this.stopCrawling = false;
        this._isCrawling = false;
        this._crawlingStatus = "";
        this.isCrawlingCompleted = false;
        this.params = params;
        this.localServer = localServer;
        this.device_id = [8, 4, 4, 4, 12].map((len) => crypto.randomBytes(Math.trunc((len + 1) / 2))
            .toString('hex').substring(0, len)).join("-");
        if (!fs.existsSync(crawler.staticFileMapPath)) {
            console.error(`creating new staticFileMap`);
            this.staticFileMap = new Map();
        }
        else
            try {
                let json = fs.readFileSync(crawler.staticFileMapPath, 'utf-8');
                let map = JSON.parse(json, parameters.reviver);
                if (!(map instanceof Map))
                    throw new Error(`not instance of map`);
                this.staticFileMap = map;
            }
            catch (e) {
                console.error(`error loading staticFileMap, creating new one`, e);
                this.staticFileMap = new Map();
            }
        if (!fs.existsSync(crawler.staticFile404SetPath)) {
            console.error(`creating new staticFile404Set`);
            this.staticFile404Set = new Set();
        }
        else
            try {
                let json = fs.readFileSync(crawler.staticFile404SetPath, 'utf-8');
                let set = JSON.parse(json, parameters.reviver);
                if (!(set instanceof Set))
                    throw new Error(`not instance of set`);
                this.staticFile404Set = set;
            }
            catch (e) {
                console.error(`error loading staticFile404Set, creating new one`, e);
                this.staticFile404Set = new Set();
            }
        this.localRootDir = path.join(".", "static");
        this.localConflictDir = path.join(".", "conflict");
        const unsortedFileExtSet = new Set();
        let isWebResCompleted;
        try {
            const replacementJs = (_a = this.readFile("/magica/js/system/replacement.js")) === null || _a === void 0 ? void 0 : _a.toString('utf-8');
            if (replacementJs != null) {
                const fileTimeStampObj = JSON.parse(replacementJs.replace(/^\s*window\.fileTimeStamp\s*=\s*/, ""));
                let completed = true;
                for (let subPath in fileTimeStampObj) {
                    let matched = subPath.match(crawler.fileExtRegEx);
                    if (matched)
                        unsortedFileExtSet.add(matched[0]);
                }
                for (let subPath in fileTimeStampObj) {
                    let key = `/magica/${subPath}`.split("/").map((s) => encodeURIComponent(s)).join("/");
                    if (!this.staticFileMap.has(key) && !this.staticFile404Set.has(key)) {
                        console.log(`[${key}] is still missing`);
                        completed = false;
                        break;
                    }
                }
                isWebResCompleted = completed;
            }
        }
        catch (e) {
            isWebResCompleted = false;
            console.error(e);
        }
        this.isWebResCompleted = isWebResCompleted != null ? isWebResCompleted : false;
        let isAssetsCompleted;
        try {
            let completed = true;
            const maintenanceConfigStr = (_b = this.readFile(`/maintenance/magica/config`)) === null || _b === void 0 ? void 0 : _b.toString('utf-8');
            if (maintenanceConfigStr != null) {
                const assetver = this.readAssetVer(maintenanceConfigStr);
                const mergedAssetList = [];
                let allAssetListExists = true;
                crawler.assetListFileNameList.find((fileName) => {
                    var _a;
                    const assetListStr = (_a = this.readFile(`/magica/resource/download/asset/master/resource/${assetver}/${fileName}`)) === null || _a === void 0 ? void 0 : _a.toString('utf-8');
                    if (assetListStr == null) {
                        allAssetListExists = false;
                        return true;
                    }
                    const assetList = JSON.parse(assetListStr);
                    assetList.forEach((item) => mergedAssetList.push(item));
                });
                if (allAssetListExists) {
                    mergedAssetList.forEach((item) => {
                        let matched = item.file_list[0].url.match(crawler.fileExtRegEx);
                        if (matched)
                            unsortedFileExtSet.add(matched[0]);
                    });
                    mergedAssetList.find((item) => {
                        const fileName = item.file_list[0].url;
                        const key = `/magica/resource/download/asset/master/resource/${assetver}/${fileName}`;
                        if (!this.staticFileMap.has(key) || !this.staticFile404Set.has(key)) {
                            console.log(`[${key}] is still missing`);
                            completed = false;
                            return true;
                        }
                    });
                }
                else {
                    completed = false;
                }
            }
        }
        catch (e) {
            isAssetsCompleted = false;
            console.error(e);
        }
        try {
            const writePath = path.join(".", "fileExtSet.json");
            const fileExtArray = Array.from(unsortedFileExtSet.keys()).sort();
            const fileExtSet = new Set(fileExtArray);
            const stringified = JSON.stringify(fileExtSet, parameters.replacer, 4);
            let noChange = false;
            if (fs.existsSync(writePath) && fs.statSync(writePath).isFile()) {
                const content = fs.readFileSync(writePath, 'utf-8');
                if (content === stringified)
                    noChange = true;
            }
            if (!noChange)
                fs.writeFileSync(writePath, stringified);
        }
        catch (e) {
            console.error(e);
        }
        this.isAssetsCompleted = isAssetsCompleted != null ? isAssetsCompleted : false;
    }
    get timeStampSec() {
        let ts = new Date().getTime();
        let tsSec = Math.trunc(ts / 1000);
        return String(tsSec);
    }
    get httpsProdMagicaNoSlash() { return `https://${crawler.prodHost}/magica`; }
    get httpsPatchMagicaNoSlash() { return `https://${crawler.patchHost}/magica`; }
    get isCrawling() {
        return this._isCrawling;
    }
    get lastError() {
        return this._lastError;
    }
    get crawlingStatus() {
        return this._crawlingStatus;
    }
    get isCrawlingFullyCompleted() {
        return !this._isCrawling && this.isCrawlingCompleted && !this.stopCrawling;
    }
    fetchAllAsync() {
        return new Promise((resolve, reject) => this.getFetchAllPromise()
            .then((result) => resolve(result))
            .catch((err) => {
            this.params.save({ key: "openIdTicket", val: undefined })
                .finally(() => {
                this._isCrawling = false;
                reject(this._lastError = err);
            });
        }).finally(() => {
            // not changing this._crawlingStatus
            console.log(`saving stringifiedMap and stringified404Set ...`);
            let stringifiedMap = JSON.stringify(this.staticFileMap, parameters.replacer);
            fs.writeFileSync(crawler.staticFileMapPath, stringifiedMap, 'utf-8');
            let stringified404Set = JSON.stringify(this.staticFile404Set, parameters.replacer);
            fs.writeFileSync(crawler.staticFile404SetPath, stringified404Set, 'utf-8');
            console.log(`saved stringifiedMap and stringified404Set`);
        }));
    }
    async getFetchAllPromise() {
        if (this._isCrawling)
            throw new Error("previous crawling has not finished");
        this.stopCrawling = false;
        this._isCrawling = true;
        this.isCrawlingCompleted = false;
        this._lastError = undefined;
        this._crawlingStatus = "";
        const crawlWebRes = this.params.crawlWebRes, crawlAssets = this.params.crawlAssets;
        if (crawlWebRes) {
            console.log(this._crawlingStatus = `crawling index.html ...`);
            let indexHtml = await this.fetchSinglePage(crawler.prodHost, "/magica/index.html", crawler.htmlRegEx);
            let matched = indexHtml.match(/<head\s+time="(\d+)"/);
            if (matched == null)
                throw this._lastError = new Error(`cannot match time in index.html`);
            let headTime = parseInt(matched[1]);
            if (isNaN(headTime))
                throw this._lastError = new Error(`headTime is NaN`);
            console.log(this._crawlingStatus = `crawling files in replacement.js ...`);
            await this.fetchFilesInReplacementJs(headTime);
        }
        if (crawlAssets) {
            console.log(this._crawlingStatus = `crawling assets ...`);
            let assetConfigObj = await this.fetchAssetConfig();
            await this.fetchAssets(assetConfigObj);
        }
        console.log(this._crawlingStatus = `${this.stopCrawling ? "stopped crawling" : "crawling completed"}`);
        this._isCrawling = false;
        this.isCrawlingCompleted = true;
    }
    getContentType(pathInUrl) {
        const fileMetaArray = this.staticFileMap.get(pathInUrl);
        if (fileMetaArray == null || fileMetaArray.length == 0)
            return crawler.defMimeType;
        const contentType = fileMetaArray[0].contentType;
        if (contentType != null)
            return contentType;
        else
            return crawler.defMimeType;
    }
    readFile(pathInUrl, specifiedMd5) {
        var _a;
        // not checking md5 here
        let logPrefix = `readFile`;
        const readPath = path.join(this.localRootDir, pathInUrl);
        if (specifiedMd5 == null) {
            if (fs.existsSync(readPath)) {
                if (fs.statSync(readPath).isFile()) {
                    const content = fs.readFileSync(readPath);
                    if (parameters.params.VERBOSE)
                        console.log(`${logPrefix}: [${pathInUrl}]`);
                    return content;
                }
                else
                    throw new Error(`readPath=[${readPath}] exists but it is not a file`);
            }
            else {
                if (parameters.params.VERBOSE)
                    console.log(`${logPrefix} (not found) : [${pathInUrl}]`);
                return undefined;
            }
        } // else specifiedMd5 != null
        logPrefix += ` with specified md5`;
        const metaArray = this.staticFileMap.get(pathInUrl) || [];
        if (((_a = metaArray[0]) === null || _a === void 0 ? void 0 : _a.md5) === specifiedMd5) {
            if (fs.existsSync(readPath)) {
                if (fs.statSync(readPath).isFile()) {
                    const content = fs.readFileSync(readPath);
                    if (parameters.params.VERBOSE)
                        console.log(`${logPrefix}: [${pathInUrl}]`);
                    return content;
                }
                else
                    throw new Error(`readPath=[${readPath}] exists but it is not a file`);
            }
            else
                throw new Error(`staticFileMap has the record of readPath=[${readPath}] but that file does not exist`);
        }
        else {
            if (metaArray.find((meta) => meta.md5 === specifiedMd5) != null) {
                const conflictDirNameWithoutMd5 = path.dirname(path.join(this.localConflictDir, pathInUrl));
                const conflictDirNameWithMd5 = path.join(conflictDirNameWithoutMd5, specifiedMd5);
                const conflictReadPath = path.join(conflictDirNameWithMd5, path.basename(pathInUrl));
                if (fs.existsSync(conflictReadPath)) {
                    if (fs.statSync(conflictReadPath).isFile()) {
                        const content = fs.readFileSync(readPath);
                        if (parameters.params.VERBOSE)
                            console.log(`${logPrefix} (in conflict dir) : [${pathInUrl}]`);
                        return content;
                    }
                    else
                        throw new Error(`conflictReadPath=[${conflictReadPath}] exists but it is not a file`);
                }
                else
                    throw new Error(`staticFileMap has the record of conflictReadPath=[${conflictReadPath}] but that file does not exist`);
            }
            else {
                if (parameters.params.VERBOSE)
                    console.log(`${logPrefix} (not found) : [${pathInUrl}]`);
                return undefined;
            }
        }
    }
    saveFile(pathInUrl, content, contentType, preCalcMd5) {
        let logPrefix = `saveFile`;
        const md5ToWrite = preCalcMd5 != null ? preCalcMd5 : crypto.createHash("md5").update(content).digest('hex');
        if (this.checkAlreadyExist(pathInUrl, md5ToWrite)) {
            console.log(`${logPrefix} already exist [${pathInUrl}]`);
        }
        else {
            // file does not exist or it's moved away just now
            const writePath = path.join(this.localRootDir, pathInUrl);
            fs.writeFileSync(writePath, content);
            console.log(`${logPrefix} written to [${pathInUrl}]`);
        }
        this.updateFileMeta(pathInUrl, md5ToWrite, contentType);
    }
    checkAlreadyExist(pathInUrl, givenMd5) {
        let logPrefix = `checkAlreadyExist`;
        const writePath = path.join(this.localRootDir, pathInUrl);
        // firstly mkdir -p
        const dirName = path.dirname(writePath);
        if (!fs.existsSync(dirName))
            fs.mkdirSync(dirName, { recursive: true });
        if (!fs.statSync(dirName).isDirectory())
            throw new Error(`dirName=[${dirName}] is not directory`);
        // if the file does not exist, then it's okay to write
        if (!fs.existsSync(writePath))
            return false; // file does not exist, just as expected
        // unfortunately, the file already exists, but it would still be okay if the md5 matches
        if (!fs.statSync(writePath).isFile())
            throw new Error(`writePath=[${writePath}] exists but it is not a file`);
        const calculatedMd5 = crypto.createHash("md5").update(fs.readFileSync(writePath)).digest('hex');
        if (calculatedMd5 === givenMd5)
            return true; // fortunately the md5 matches!
        // unfortunately the md5 doesn't match, move the mismatched file away
        const pathInConflictDir = path.join(this.localConflictDir, pathInUrl);
        const moveToDir = path.join(path.dirname(pathInConflictDir), calculatedMd5);
        fs.mkdirSync(moveToDir, { recursive: true });
        if (!fs.statSync(moveToDir).isDirectory())
            throw new Error(`moveToDir=[${moveToDir}] is not directory`);
        const moveToPath = path.join(moveToDir, path.basename(pathInUrl));
        fs.renameSync(writePath, moveToPath);
        console.log(`${logPrefix}: moved ${writePath} to ${moveToPath}`);
        return false; // don't know how to updateFileMeta without known contentType, let saveFile do this
    }
    updateFileMeta(pathInUrl, md5, contentType) {
        var _a;
        const meta = { md5: md5 };
        if (contentType != null)
            meta.contentType = contentType;
        const metaArray = ((_a = this.staticFileMap.get(pathInUrl)) === null || _a === void 0 ? void 0 : _a.filter((item) => item.md5 !== md5)) || [];
        metaArray.unshift(meta);
        this.staticFileMap.set(pathInUrl, metaArray);
    }
    async http2Request(url, overrideReqHeaders, cvtBufToStr = false, postData) {
        const method = postData == null ? http2.constants.HTTP2_METHOD_GET : http2.constants.HTTP2_METHOD_POST;
        const host = url.host, hostname = url.hostname;
        const authorityURL = new URL(`https://${host}/`);
        const path = `${url.pathname}${url.search}`;
        const reqHeaders = overrideReqHeaders || {
            [http2.constants.HTTP2_HEADER_METHOD]: method,
            [http2.constants.HTTP2_HEADER_PATH]: path,
            [http2.constants.HTTP2_HEADER_AUTHORITY]: hostname,
            [http2.constants.HTTP2_HEADER_HOST]: host,
            [http2.constants.HTTP2_HEADER_USER_AGENT]: `Mozilla/5.0 (Linux; Android 6.0.1; MuMu Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.158 Mobile Safari/537.36`,
            [http2.constants.HTTP2_HEADER_ACCEPT]: "*/*",
            [http2.constants.HTTP2_HEADER_REFERER]: `https://${host}/magica/index.html`,
            [http2.constants.HTTP2_HEADER_ACCEPT_LANGUAGE]: `zh-CN,en-US;q=0.9`,
            ["X-Requested-With"]: `com.bilibili.madoka.bilibili`,
        };
        const fileExtMatched = url.pathname.match(crawler.fileExtRegEx);
        if (fileExtMatched != null && crawler.compressableFileExtSet.has(fileExtMatched[0])) {
            reqHeaders[http2.constants.HTTP2_HEADER_ACCEPT_ENCODING] = `gzip, deflate`;
        }
        const resp = await this.localServer.sendHttp2RequestAsync(authorityURL, reqHeaders, postData, cvtBufToStr);
        const respHeaders = resp.headers;
        const statusCode = respHeaders[":status"];
        if (statusCode != 200 && statusCode != 404)
            throw new Error(`statusCode=[${statusCode}]`);
        let contentType = respHeaders[http2.constants.HTTP2_HEADER_CONTENT_TYPE];
        if (contentType != null && Array.isArray(contentType))
            contentType = contentType.join(";");
        let result = {
            is404: statusCode == 404,
            body: resp.respBody,
        };
        if (contentType != null)
            result.contentType = contentType;
        return result;
    }
    async http2GetStr(url, overrideReqHeaders) {
        return await this.http2Request(url, overrideReqHeaders, true);
    }
    async http2GetBuf(url, overrideReqHeaders) {
        return await this.http2Request(url, overrideReqHeaders, false);
    }
    async http2PostRetStr(url, postData, overrideReqHeaders) {
        return await this.http2Request(url, overrideReqHeaders, true, postData);
    }
    async http2PostRetBuf(url, postData, overrideReqHeaders) {
        return await this.http2Request(url, overrideReqHeaders, false, postData);
    }
    async batchHttp2GetSave(stageStr, urlList, concurrent = 8) {
        let urlStrSet = new Set(), abandonedSet = new Set(), skippedSet = new Set();
        let currentStaticFile404Set = new Set();
        urlList.forEach((item) => {
            const url = item.url;
            const key = url.pathname;
            if (urlStrSet.has(key))
                throw new Error(`found duplicate url=${key} in urlList`);
            urlStrSet.add(key);
        });
        const total = urlList.length;
        concurrent = Math.floor(concurrent);
        if (concurrent < 1 || concurrent > 8)
            throw new Error("concurrent < 1 || concurrent > 8");
        let resultMap = new Map();
        let hasError = false, stoppedCrawling = false;
        let crawl = async (queueNo) => {
            this._crawlingStatus = `[${stageStr}]`
                + ` fetched/total=[${resultMap.size}/${total}] remaining=[${urlStrSet.size - resultMap.size}]`
                + ` not_found=[${currentStaticFile404Set.size}] skipped=[${skippedSet.size}] abandoned=[${abandonedSet.size}]`;
            let item = urlList.shift();
            if (item == null)
                return false;
            let url = item.url, md5 = item.md5;
            let key = url.pathname;
            if (hasError) {
                abandonedSet.add(key);
                urlStrSet.delete(key);
                return true;
            }
            if (this.stopCrawling) {
                stoppedCrawling = true;
                if (!stoppedCrawling)
                    console.log(`stop crawling (queue ${queueNo})`);
            }
            if (stoppedCrawling) {
                abandonedSet.add(key);
                urlStrSet.delete(key);
                return true;
            }
            if (md5 != null) {
                const fileMeta = this.staticFileMap.get(key);
                if (fileMeta != null && fileMeta[0].md5 === md5) {
                    skippedSet.add(key);
                    urlStrSet.delete(key);
                    return true; // skip downloaded asset
                }
            }
            try {
                let resp = await this.http2GetBuf(url);
                if (resp.is404) {
                    this.staticFile404Set.add(key);
                    currentStaticFile404Set.add(key);
                    urlStrSet.delete(key);
                    console.log(`HTTP 404 [${url.pathname}${url.search}]`);
                }
                else {
                    let calculatedMd5 = crypto.createHash("md5").update(resp.body).digest("hex").toLowerCase();
                    if (md5 != null && calculatedMd5 !== md5)
                        throw new Error(`md5 mismatch on [${url.pathname}${url.search}]`);
                    this.saveFile(key, resp.body, resp.contentType, calculatedMd5);
                    this.staticFile404Set.delete(key);
                    currentStaticFile404Set.delete(key);
                    if (resultMap.has(key))
                        throw new Error(`resultMap already has key=[${key}]`);
                    resultMap.set(key, { url: url, resp: resp });
                }
            }
            catch (e) {
                hasError = true;
                console.error(`batchHttp2Get error on url=[${url.href}]`, e);
                throw e;
            }
            return true;
        };
        let startPromises = urlList.slice(0, Math.min(concurrent, urlList.length))
            .map(async (_url, index) => {
            const queueNo = index;
            while (await crawl(queueNo))
                ;
        });
        await Promise.allSettled(startPromises);
        await Promise.all(startPromises);
        urlStrSet.forEach((urlStr) => {
            if (!resultMap.has(urlStr) && !skippedSet.has(urlStr) && !abandonedSet.has(urlStr)
                && !currentStaticFile404Set.has(urlStr)) {
                // should never happen
                throw new Error(`key=[${urlStr}] is missing in both resultMap/skippedSet/abandonedSet/currentStaticFile404Set`);
            }
        });
        let results = [];
        resultMap.forEach((val) => results.push(val));
        return results;
    }
    async fetchSinglePage(host, pathpart, contentTypeRegEx) {
        const reqHeaders = {
            [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
            [http2.constants.HTTP2_HEADER_PATH]: pathpart,
            [http2.constants.HTTP2_HEADER_AUTHORITY]: host,
            [http2.constants.HTTP2_HEADER_HOST]: host,
            [http2.constants.HTTP2_HEADER_ACCEPT_ENCODING]: `gzip, deflate`,
            [http2.constants.HTTP2_HEADER_CONTENT_TYPE]: `text/plain; charset=utf-8`,
            ["Deviceid"]: `${this.device_id}`,
            ["User-Id-Fba9x88mae"]: `magica_`,
            ["X-Platform-Host"]: `https://${host}`,
            ["Ticket"]: "",
            ["Ticket-Verify"]: `from_cocos`,
        };
        const pageUrl = new URL(`https://${host}${pathpart}`);
        const resp = await this.http2GetStr(pageUrl, reqHeaders);
        const contentType = resp.contentType;
        if (!(contentType === null || contentType === void 0 ? void 0 : contentType.match(contentTypeRegEx)))
            throw new Error(`[${pathpart}] contentType=[${contentType}] does not match [${contentTypeRegEx}]`);
        this.saveFile(pageUrl.pathname, Buffer.from(resp.body, 'utf-8'), contentType);
        return resp.body;
    }
    async fetchFilesInReplacementJs(headTime) {
        const replacementJsUrl = new URL(`${this.httpsProdMagicaNoSlash}/js/system/replacement.js?${headTime}`);
        const resp = await this.http2GetStr(replacementJsUrl);
        const contentType = resp.contentType;
        if (!(contentType === null || contentType === void 0 ? void 0 : contentType.match(crawler.javaScriptRegEx)))
            throw new Error(`replacement.js contentType=[${contentType}] not application/javascript`);
        const replacementJs = resp.body;
        this.saveFile(replacementJsUrl.pathname, Buffer.from(replacementJs, 'utf-8'), contentType);
        const fileTimeStampObj = JSON.parse(replacementJs.replace(/^\s*window\.fileTimeStamp\s*=\s*/, ""));
        let urlList = [];
        for (let subPath in fileTimeStampObj) {
            let fileTimeStamp = fileTimeStampObj[subPath]; //it's actually unknown what this value is
            if (!(subPath === null || subPath === void 0 ? void 0 : subPath.match(/^([0-9a-z\-\._ \(\)]+\/)+[0-9a-z\-\._ \(\)]+\.[0-9a-z]+$/i)))
                throw new Error(`invalid subPath=[${subPath}] fileTimeStamp=[${fileTimeStamp}]`);
            if (!(fileTimeStamp === null || fileTimeStamp === void 0 ? void 0 : fileTimeStamp.match(/^[0-9a-f]{16}$/)))
                throw new Error(`subPath=[${subPath}] has invalid fileTimeStamp=[${fileTimeStamp}]`);
            urlList.push({
                url: new URL(`${this.httpsProdMagicaNoSlash}/${subPath}?${headTime}`),
            });
        }
        await this.batchHttp2GetSave(`webRes`, urlList);
    }
    readAssetVer(maintenanceConfigStr) {
        const maintenanceConfig = JSON.parse(maintenanceConfigStr);
        if (maintenanceConfig["status"] != 0)
            throw new Error("maintenanceConfig.status is not 0");
        const assetver = maintenanceConfig["assetver"]; // "2207081501"
        if (!(assetver === null || assetver === void 0 ? void 0 : assetver.match(/^\d+$/i)))
            throw new Error("cannot read assetver from maintenanceConfig");
        return assetver;
    }
    async fetchAssetConfig() {
        console.log(this._crawlingStatus = `crawling maintenance config ...`);
        const maintenanceConfigStr = await this.fetchSinglePage(crawler.prodHost, `/maintenance/magica/config?type=1&platform=2&version=30011&gameid=1&time=${this.timeStampSec}`, crawler.jsonRegEx);
        const assetver = this.readAssetVer(maintenanceConfigStr);
        console.log(this._crawlingStatus = `crawling asset_config.json ...`);
        const assetConfigStr = await this.fetchSinglePage(crawler.patchHost, `/magica/resource/download/asset/master/resource/${assetver}/asset_config.json?${this.timeStampSec}`, crawler.jsonRegEx);
        const assetConfig = JSON.parse(assetConfigStr);
        const assetConfigVersion = assetConfig["version"];
        if (typeof assetConfigVersion !== 'number')
            throw new Error("assetConfig.version is not number");
        let promises = crawler.assetListFileNameList.map(async (fileName) => {
            console.log(this._crawlingStatus = `crawling ${fileName} ...`);
            const jsonStr = await this.fetchSinglePage(crawler.patchHost, `/magica/resource/download/asset/master/resource/${assetver}/${fileName}?${this.timeStampSec}`, crawler.jsonRegEx);
            const assetList = JSON.parse(jsonStr);
            if (!Array.isArray(assetList))
                throw new Error("assetList is not array");
            if (assetList.length == 0)
                throw new Error("assetList is empty");
            if (!Array.isArray(assetList[0].file_list)) {
                throw new Error("assetList[0].file_list is not array");
            }
            if (typeof assetList[0].md5 !== 'string' || !assetList[0].md5.match(crawler.md5RegEx)) {
                throw new Error("assetList[0].md5 is not md5");
            }
            if (typeof assetList[0].path !== 'string') {
                throw new Error("assetList[0].path is not string");
            }
            return assetList;
        });
        let status = await Promise.allSettled(promises);
        let listOfAssetList = await Promise.all(status);
        let mergedAssetList = [];
        listOfAssetList.forEach((list) => {
            if (list.status === 'fulfilled') {
                list.value.forEach((item) => mergedAssetList.push(item));
            }
            else
                throw new Error("list.status is not fulfilled");
        });
        return {
            assetver: assetver,
            assetConfigVersion: assetConfigVersion,
            assetList: mergedAssetList,
        };
    }
    async fetchAssets(assetConfig) {
        console.log(this._crawlingStatus = `crawling asset files ...`);
        //const assetver = assetConfig.assetver;
        const assetList = assetConfig.assetList;
        const urlMap = new Map();
        assetList.forEach((item) => {
            const partialUrl = item.file_list[0].url;
            const pathname = `/resource/download/asset/master/resource/${partialUrl}`;
            const md5 = item.md5;
            const url = new URL(`${this.httpsPatchMagicaNoSlash}${pathname}?${md5}`);
            if (urlMap.has(url.href)) {
                console.warn(`skipping duplicate url=[${url.href}]`);
            }
            else {
                urlMap.set(url.href, {
                    url: url,
                    md5: md5,
                });
            }
        });
        const urlList = Array.from(urlMap.values());
        await this.batchHttp2GetSave(`assets`, urlList);
    }
}
exports.crawler = crawler;
crawler.htmlRegEx = /^text\/html(?=(\s|;|$))/i;
crawler.javaScriptRegEx = /^application\/javascript(?=(\s|;|$))/i;
crawler.jsonRegEx = /^application\/json(?=(\s|;|$))/i;
crawler.md5RegEx = /^[0-9a-f]{32}$/i;
crawler.fileExtRegEx = /\.[^\.]+$/;
crawler.compressableFileExtSet = new Set([
    ".ExportJson",
    ".bytes",
    //".canx",
    ".css",
    ".db",
    //".hca",
    ".html",
    //".jpg",
    ".js",
    ".json",
    ".moc",
    //".mp4",
    ".mtn",
    ".plist",
    //".png",
    //".usm",
    ".vfx",
    ".vfxb",
    ".vfxj",
    //".zip",
]);
crawler.defMimeType = "application/octet-stream";
crawler.staticFileMapPath = path.join(".", "staticFileMap.json");
crawler.staticFile404SetPath = path.join(".", "staticFile404Set.json");
crawler.prodHost = "l3-prod-all-gs-mfsn2.bilibiligame.net";
crawler.patchHost = "line3-prod-patch-mfsn2.bilibiligame.net";
crawler.assetListFileNameList = [
    "asset_char_list.json",
    "asset_main.json",
    "asset_voice.json",
    "asset_movie_high.json",
    "asset_movie_low.json",
    "zip_asset_main.json",
    "zip_asset_voice.json",
    "zip_asset_movie_high.json",
    "zip_asset_movie_low.json",
];
