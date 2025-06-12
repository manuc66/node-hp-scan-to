import { Parser } from "xml2js";
const parser = new Parser();
export const parseXmlString = <T>(value: string): Promise<T> =>
  new Promise((resolve, reject) => {
    parser.parseString(value, (error, result: unknown) => {
      if (error) {
        reject(error);
      } else {
        resolve(result as T);
      }
    });
  });
