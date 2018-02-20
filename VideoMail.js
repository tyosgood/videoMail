/**
 * VideoMail for Cisco CE endpoints
 * @module VideoMail
 * @author Tyler Osgood <tyosgood@cisco.com>
 * @copyright Copyright (c) 2018 Cisco and/or its affiliates.
 * @license Cisco Sample Code License, Version 1.0
 */

/**
 * @license
 * Copyright (c) 2018 Cisco and/or its affiliates.
 *
 * This software is licensed to you under the terms of the Cisco Sample
 * Code License, Version 1.0 (the "License"). You may obtain a copy of the
 * License at
 *
 *                https://developer.cisco.com/docs/licenses
 *
 * All use of the material herein must be in accordance with the terms of
 * the License. All rights not expressly granted by the License are
 * reserved. Unless required by applicable law or agreed to separately in
 * writing, software distributed under the License is distributed on an "AS
 * IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied.
 */


const xapi = require('xapi');
var isInVmCall = 0;
var vmURI;
var messageWaiting = 0;
var forwarded;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//Set VM pilot number
xapi.status.get('SIP Mailbox URI').then(URI => vmURI = URI );
xapi.status.get('SIP Mailbox MessagesWaiting').then(MWI => messageWaiting = MWI )
setGUIvalues("numberOfMessages","You currently have " + messageWaiting + " new messages ");
console.log("You currently have " + messageWaiting + " new messages ");


//this fires when the number of VM messages changes
xapi.status.on('SIP Mailbox MessagesWaiting', (MWI) =>{
  setGUIvalues("numberOfMessages","You currently have " + MWI + " new messages" );
});



//this fires when call disconnects
xapi.event.on('CallDisconnect', (event) => {
	if (isInVmCall){
	  xapi.command('UserInterface Message Alert Clear');
	  xapi.command('UserInterface Message TextLine Clear');
	  setGUIvalues("setupText"," ");
	  isInVmCall = 0;
	  }
  });

xapi.event.on('OutgoingCallIndication', (event) => {
	
	console.log(event.CallId);
	xapi.status.get('Call '+event.CallId+' RemoteNumber').then(dialed => {
	  console.log("in event Call");
	});
	//console.log(dialedNum);
  });

//this fires when a call is placed and then calls the pin entry if the call is to the VM pilot
xapi.status.on('Call RemoteNumber', (remoteNumber) => {
	console.log("in Status Call");
	//the extra logic here is needed to prevent the PIN screen popping up when a call is forwarded to voicemail
	if(remoteNumber.includes(vmURI) && !forwarded){
	    isInVmCall = 1;
	    enterVmPin();
	}
	  else {
	    forwarded = true;
	    sleep(2500).then(() => {
	              forwarded = false;
	            });
	  }
    });

xapi.event.on('UserInterface Message TextInput Response', (event) => {
	switch(event.FeedbackId){
        case 'vmpin':
	          xapi.status.get('SIP Mailbox MessagesWaiting').then(MWI => messageWaiting = MWI );
		        sleep(500).then(() => {
	               sendDTMF(event.Text);
	                if(!event.Text.includes('#')) sendDTMF('#');
	           });
	                if (messageWaiting == 0){
	                     xapi.command('UserInterface Message Alert Display', 
	                     {
	                        Title: "You have no new messages",
	                        Text: "Open the SSA VideoMail control panel (on the bottom of your screen) for Mailbox Options"
	                      });
	                    }
	                    
	          //wait for CUC to start playing the new messages - adjust 5000 as necessary
	          sleep(5000).then(() => {
	                if (messageWaiting > 0) {xapi.command('UserInterface Message Alert Display',
	                      {
	                        Title: "Your Messages should be playing - if they are not, your pin was entered incorrectly",
	                        Text: "Click the SSA VideoMail icon on the bottom of your screen, then click Re-Enter PIN to try again",
	                        Duration: "10"
	                      });
	                      xapi.command('UserInterface Message TextLine Display', 
	                      {
	                        Text: "Open the SSA VideoMail control panel (on the bottom of your screen) to control message playback",
	                        X:'600',
	                        Y:'1'
	                      });
	                }
		       });
	            break;

	     case 'resetPin':  
		        sleep(500).then(() => {
	               sendDTMF(event.Text);
	                if(!event.Text.includes('#')) sendDTMF('#');
	           });
	          sleep(500).then(() => {
	              enterVmPin("resetPinExit","Re-Enter PIN to confirm");
	            });
	    	     break;

    	 case 'resetPinExit':  
	    	     sleep(500).then(() => {
	               sendDTMF(event.Text);
	                if(!event.Text.includes('#')) sendDTMF('#');
	                  
	           });
	           setGUIvalues("setupText","Your new PIN has been successfully set");
	           sleep(5000).then(() => {
	              xapi.command('Call Disconnect');
	            });
		         break;
   
	}
});

xapi.event.on('UserInterface Extensions Widget Action', (event) => {
    if (event.Type === 'clicked') {
      var parsedWidgetId = event.WidgetId.split("_");
      switch(parsedWidgetId[0]){
      case 'key':
          const digit = parsedWidgetId[parsedWidgetId.length - 1];
          console.log('digit = ', digit);
          sendDTMF(digit);
          break;
      case 'cmd':
          switch(parsedWidgetId[parsedWidgetId.length - 1]){
              case 're-enterPIN':
                  enterVmPin();
                  break;
              case 'exit':
                  xapi.command('Call Disconnect');
                  break;
              case 'stophangup':
                  sendDTMF('#');
                  setGUIvalues('setupText', ' ');
                  sleep(500).then(() => {
                      xapi.command('Call Disconnect');
                  });
                  break;
              case 'resetPIN':
                  sendDTMF('431');
                  sleep(500).then(() => {
                    enterVmPin("resetPin","Enter a new PIN of at least 6 digits");
                  });
                  break;
              case 'recGreeting':
                  sendDTMF('411');
                  sleep(5000).then(() => {
                    setGUIvalues('setupText', 'Record your greeting now');
                  });
                  break;
          }
          break;
            
      }
        
    }
    
  });
  
function sendDTMF(digits)
{
    xapi.command("Call DTMFSend", {DTMFString: digits});
}

function setGUIvalues(guiId,value)
{
    xapi.command('UserInterface Extensions Widget SetValue', { 
        WidgetId: guiId, 
        Value: value
    });
}

function enterVmPin(id = "vmpin", text = "Please enter your PIN")
{
    xapi.command("UserInterface Message TextInput Display", {
				  Duration: 45
				, FeedbackId: id
				, InputType: 'PIN'
				, KeyboardState:'Open'
				, Placeholder: text
				, SubmitText:'Submit PIN'
				, Title: 'SSA VideoMail'
				, Text: text
			    });
}
