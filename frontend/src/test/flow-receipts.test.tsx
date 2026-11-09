import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {GapsPage} from '../ui-plugins/operations';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('allows pre-effect correction and keeps completion feedback after card disappears',async()=>{
 let posts=0;const bodies:any[]=[];
 const data={csrfToken:'token',rows:[{flow:'synthetic',result:{gaps:[{id:'one',revision:'r1',summary:'Synthetic card',form:{id:'record',label:'Record',fields:[{name:'comment',label:'Comment',type:'text',maxLength:20}]}}]}}]};
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{if(init?.method==='POST'){bodies.push(JSON.parse(String(init.body)));posts++;return Response.json(posts===1?{status:'validation',message:'Correct comment',errors:{comment:'Too long'},values:{comment:'original'},submissionId:'receipt'}:{status:'closed',message:'Saved synthetic record',submissionId:'receipt'});}return Response.json(posts===2?{csrfToken:'token',rows:[]}:data);});
 render(<GapsPage context={{agentId:null,theme:'light',readOnly:false}}/>);
 const input=await screen.findByLabelText('Comment');fireEvent.click(screen.getByRole('button',{name:'Record…'}));fireEvent.click(screen.getByRole('button',{name:'Confirm action'}));await waitFor(()=>expect(input).not.toBeDisabled());expect(input).toHaveValue('original');fireEvent.change(input,{target:{value:'fixed'}});fireEvent.click(screen.getByRole('button',{name:'Record…'}));fireEvent.click(screen.getByRole('button',{name:'Confirm action'}));await screen.findByText('No rules connected.');expect(screen.getByText(/Saved synthetic record/)).toBeTruthy();expect(screen.queryByLabelText('Comment')).toBeNull();expect(bodies[0].fields.submissionId).toBe(bodies[1].fields.submissionId);
});
