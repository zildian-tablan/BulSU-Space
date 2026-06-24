declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: {
      [sheet: string]: WorkSheet;
    };
  }
  
  export interface WorkSheet {
    [cell: string]: CellObject;
  }
  
  export interface CellObject {
    t: string; // Type
    v: any; // Value
    r?: string; // Rich text
    h?: string; // HTML
    w?: string; // Formatted text
  }
  
  export interface ReadOptions {
    type?: string;
    cellDates?: boolean;
    cellNF?: boolean;
    cellStyles?: boolean;
    cellText?: boolean;
    cellFormula?: boolean;
    sheetStubs?: boolean;
    sheetRows?: number;
    bookVBA?: boolean;
    bookDeps?: boolean;
    bookSheets?: boolean;
    bookProps?: boolean;
    bookFiles?: boolean;
    password?: string;
    WTF?: boolean;
  }
  
  export interface SheetToJSONOpts {
    header?: 'A'|number|string[];
    range?: any;
    dateNF?: string;
    defval?: any;
    blankrows?: boolean;
  }
    export function read(data: any, opts?: ReadOptions): WorkBook;
  export function readFile(filename: string, opts?: ReadOptions): WorkBook;
  export function write(wb: WorkBook, opts?: any): any;
  export function writeFile(wb: WorkBook, filename: string, opts?: any): any;
  export namespace utils {
    export function sheet_to_json<T>(worksheet: WorkSheet, opts?: SheetToJSONOpts): T[];
    export function json_to_sheet(data: any[], opts?: any): WorkSheet;
    export function book_new(): WorkBook;
    export function book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
  };
}
