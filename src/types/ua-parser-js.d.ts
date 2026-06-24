declare module 'ua-parser-js' {
  export class UAParser {
    constructor(uastring?: string);
    getResult(): UAParserResult;
    getDevice(): UAParserDevice;
    getBrowser(): UAParserBrowser;
    getEngine(): UAParserEngine;
    getOS(): UAParserOS;
    getCPU(): UAParserCPU;
    getUA(): string;
    setUA(uastring: string): UAParser;
  }

  export interface UAParserResult {
    ua: string;
    browser: UAParserBrowser;
    device: UAParserDevice;
    engine: UAParserEngine;
    os: UAParserOS;
    cpu: UAParserCPU;
  }

  export interface UAParserBrowser {
    name?: string;
    version?: string;
    major?: string;
  }

  export interface UAParserDevice {
    model?: string;
    type?: string;
    vendor?: string;
  }

  export interface UAParserEngine {
    name?: string;
    version?: string;
  }

  export interface UAParserOS {
    name?: string;
    version?: string;
  }

  export interface UAParserCPU {
    architecture?: string;
  }
}
