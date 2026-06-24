declare module 'dompurify' {
  namespace DOMPurify {
    function sanitize(source: string, config?: any): string;
  }
  
  export default DOMPurify;
}
