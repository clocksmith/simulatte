/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/png-chunks-encode@1.0.0/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as w from"./14a5ff2f7f7c4049afdc.js";import*as C from"./548280647f9f4ef73b15.js";function p(n){return n&&Object.prototype.hasOwnProperty.call(n,"default")?n.default:n}var $=p(w),b=p(C),c,x;function q(){if(x)return c;x=1;var n=$,A=b;c=h;var t=new Uint8Array(4),g=new Int32Array(t.buffer),s=new Uint32Array(t.buffer);function h(u){var v=8,e=v,a;for(a=0;a<u.length;a++)v+=u[a].data.length,v+=12;var r=new Uint8Array(v);for(r[0]=137,r[1]=80,r[2]=78,r[3]=71,r[4]=13,r[5]=10,r[6]=26,r[7]=10,a=0;a<u.length;a++){var d=u[a],f=d.name,i=d.data,_=i.length,o=[f.charCodeAt(0),f.charCodeAt(1),f.charCodeAt(2),f.charCodeAt(3)];s[0]=_,r[e++]=t[3],r[e++]=t[2],r[e++]=t[1],r[e++]=t[0],r[e++]=o[0],r[e++]=o[1],r[e++]=o[2],r[e++]=o[3];for(var l=0;l<_;)r[e++]=i[l++];var E=o.concat(n(i)),y=A.buf(E);g[0]=y,r[e++]=t[3],r[e++]=t[2],r[e++]=t[1],r[e++]=t[0]}return r}return c}var P=q();export{P as default};
//# sourceMappingURL=/sm/a8e60f5e7cd33af1b8c8af5d55af0e673e0b938eb6146b1852a7e58824addb6d.map