// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NumericInput } from './NumericInput';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function Field({phone=false,decimal=false,clamp=false}){const[value,setValue]=useState(phone?'0944':12);return <NumericInput type={phone?'tel':'number'} value={value} min={phone?undefined:0} max={phone?undefined:100} step={decimal?'0.01':'1'} onChange={e=>{const n=phone?e.target.value:Number(e.target.value);if(!clamp||n<=20)setValue(n);}}/>;}
async function input(text){await act(async()=>{const node=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,text);node.dispatchEvent(new Event('input',{bubbles:true}));});return host.querySelector('input');}
it('normalizes phone digits while preserving leading zeros and telephone behavior',async()=>{await act(async()=>root.render(<Field phone/>));const node=await input('٠٩٤٤١٢۳۴۵۶');expect(node.value).toBe('0944123456');expect(node.type).toBe('tel');expect(node.checkValidity()).toBe(true);});
it('keeps a decimal separator while a parent stores numbers and converts Persian decimals',async()=>{await act(async()=>root.render(<Field decimal/>));expect((await input('12.')).value).toBe('12.');const node=await input('۱۲٫۵۰');expect(node.value).toBe('12.50');expect(node.checkValidity()).toBe(true);});
it('retains native integer, range and step validity',async()=>{await act(async()=>root.render(<Field/>));expect((await input('10.5')).checkValidity()).toBe(false);expect((await input('101')).checkValidity()).toBe(false);expect((await input('٠')).checkValidity()).toBe(true);});
it('rejects a malformed paste as a whole and blocks submission until corrected',async()=>{await act(async()=>root.render(<Field/>));const node=await input('10.5USD');expect(node.value).toBe('12');expect(node.checkValidity()).toBe(false);expect(host.querySelector('[role=alert]')).not.toBeNull();expect((await input('١٥')).checkValidity()).toBe(true);});
it('a parent rejection wins instead of leaving a different displayed order quantity',async()=>{await act(async()=>root.render(<Field clamp/>));expect((await input('999')).value).toBe('12');});
