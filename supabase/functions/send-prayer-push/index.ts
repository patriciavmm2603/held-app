import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:corsHeaders});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);

  try{
    const authorization=req.headers.get("Authorization");
    if(!authorization?.startsWith("Bearer ")) return json({error:"Sign in required"},401);

    let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    if(!serviceKey){
      const secretKeys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
      serviceKey=secretKeys.default||"";
    }
    if(!serviceKey) throw new Error("Server credentials are unavailable");

    const supabase=createClient(Deno.env.get("SUPABASE_URL")||"",serviceKey,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const token=authorization.slice(7);
    const {data:userData,error:userError}=await supabase.auth.getUser(token);
    if(userError||!userData.user) return json({error:"Invalid session"},401);

    const body=await req.json();
    const requestId=String(body?.request_id||"");
    const takeawayId=String(body?.takeaway_id||"");
    const checkinId=String(body?.checkin_id||"");
    const momentId=String(body?.moment_id||"");
    const prayedRequestId=String(body?.prayed_request_id||"");
    const conversationRoundId=String(body?.conversation_round_id||"");
    const milestoneDay=Number(body?.milestone_day||0);
    if(!requestId&&!takeawayId&&!checkinId&&!momentId&&!prayedRequestId&&!conversationRoundId&&![7,14,21].includes(milestoneDay)){
      return json({error:"A valid notification item is required"},400);
    }

    let itemId="";
    let recipientId="";
    let notificationTitle="";
    let notificationBody="";
    let notificationUrl="";

    let conversationRevealed=false;
    if(conversationRoundId){
      const {data:conversationRows,error:conversationError}=await supabase.rpc("process_conversation_response",{
        p_user_id:userData.user.id,
        p_round_id:conversationRoundId
      });
      if(conversationError) throw conversationError;
      const conversation=conversationRows?.[0];
      if(!conversation?.recipient_id) return json({error:"Spouse account is not linked"},400);
      recipientId=conversation.recipient_id;
      conversationRevealed=Boolean(conversation.revealed);
      itemId=conversation.item_id||("conversation-"+conversationRoundId);
      if(conversationRevealed){
        notificationTitle="Your conversation answers are ready";
        notificationBody="You both responded. Open Held to reveal your answers.";
      }else{
        notificationTitle="Your spouse answered a Held question";
        notificationBody="Respond in Conversation mode to reveal both answers.";
      }
      notificationUrl="/#together/conversation";
    }else if([7,14,21].includes(milestoneDay)){
      const {data:membership,error:membershipError}=await supabase
        .from("couple_members")
        .select("couple_id")
        .eq("user_id",userData.user.id)
        .maybeSingle();
      if(membershipError) throw membershipError;
      if(!membership) return json({sent:0,message:"Spouse account is not linked"});
      const {data:members,error:memberError}=await supabase
        .from("couple_members")
        .select("user_id")
        .eq("couple_id",membership.couple_id)
        .neq("user_id",userData.user.id);
      if(memberError) throw memberError;
      recipientId=members?.[0]?.user_id||"";
      itemId="milestone-"+userData.user.id+"-"+milestoneDay;
      notificationTitle=milestoneDay===21?"A journey completed in Held":"A Held milestone to celebrate";
      notificationBody=milestoneDay===21
        ?"Your spouse completed a 21-day journey."
        :"Your spouse reached Day "+milestoneDay+" of their journey.";
      notificationUrl="/#progress";
    }else if(takeawayId){
      const {data:takeaway,error:takeawayError}=await supabase
        .from("shared_takeaways")
        .select("id,couple_id,user_id")
        .eq("id",takeawayId)
        .eq("user_id",userData.user.id)
        .maybeSingle();
      if(takeawayError) throw takeawayError;
      if(!takeaway) return json({error:"Shared answer not found"},404);
      const {data:members,error:memberError}=await supabase
        .from("couple_members")
        .select("user_id")
        .eq("couple_id",takeaway.couple_id)
        .neq("user_id",userData.user.id);
      if(memberError) throw memberError;
      recipientId=members?.[0]?.user_id||"";
      itemId=takeaway.id;
      notificationTitle="New shared answer in Held";
      notificationBody="Your spouse shared an answer with you.";
      notificationUrl="/#together/shared/"+takeaway.id;
    }else if(checkinId){
      const {data:checkin,error:checkinError}=await supabase
        .from("daily_checkins")
        .select("id,user_id,share_with_spouse")
        .eq("id",checkinId)
        .eq("user_id",userData.user.id)
        .eq("share_with_spouse",true)
        .maybeSingle();
      if(checkinError) throw checkinError;
      if(!checkin) return json({error:"Shared check-in not found"},404);
      const {data:membership,error:membershipError}=await supabase
        .from("couple_members").select("couple_id").eq("user_id",userData.user.id).maybeSingle();
      if(membershipError) throw membershipError;
      if(!membership) return json({sent:0,message:"Spouse account is not linked"});
      const {data:members,error:memberError}=await supabase
        .from("couple_members").select("user_id").eq("couple_id",membership.couple_id).neq("user_id",userData.user.id);
      if(memberError) throw memberError;
      recipientId=members?.[0]?.user_id||"";
      itemId=checkin.id;
      notificationTitle="A new check-in in Held";
      notificationBody="Your spouse shared how they are doing today.";
      notificationUrl="/#together";
    }else if(momentId){
      const {data:moment,error:momentError}=await supabase
        .from("couple_moments")
        .select("id,couple_id,user_id,kind,is_shared")
        .eq("id",momentId)
        .eq("user_id",userData.user.id)
        .eq("is_shared",true)
        .maybeSingle();
      if(momentError) throw momentError;
      if(!moment) return json({error:"Shared moment not found"},404);
      const {data:members,error:memberError}=await supabase
        .from("couple_members")
        .select("user_id")
        .eq("couple_id",moment.couple_id)
        .neq("user_id",userData.user.id);
      if(memberError) throw memberError;
      recipientId=members?.[0]?.user_id||"";
      itemId=moment.id;
      const titles:Record<string,string>={
        encouragement:"A little encouragement in Held",
        weekly_reflection:"A weekly reflection in Held",
        conversation_answer:"Your spouse revealed an answer",
        memory:"A new memory in Held",
        answered_prayer:"An answered prayer to celebrate"
      };
      notificationTitle=titles[moment.kind]||"Something new in Held";
      notificationBody=moment.kind==="answered_prayer"?"Your spouse marked a prayer as answered.":"Your spouse shared something with you.";
      notificationUrl="/#together";
    }else if(prayedRequestId){
      const {data:prayer,error:prayerError}=await supabase
        .from("prayer_requests")
        .select("id,sender_id,recipient_id")
        .eq("id",prayedRequestId)
        .eq("recipient_id",userData.user.id)
        .maybeSingle();
      if(prayerError) throw prayerError;
      if(!prayer) return json({error:"Prayer request not found"},404);
      recipientId=prayer.sender_id;
      itemId=prayer.id;
      notificationTitle="Your spouse prayed for you";
      notificationBody="Your prayer request was held in prayer.";
      notificationUrl="/#together/prayer/"+prayer.id;
    }else{
      const {data:prayer,error:prayerError}=await supabase
        .from("prayer_requests")
        .select("id,sender_id,recipient_id")
        .eq("id",requestId)
        .eq("sender_id",userData.user.id)
        .maybeSingle();
      if(prayerError) throw prayerError;
      if(!prayer) return json({error:"Prayer request not found"},404);
      recipientId=prayer.recipient_id;
      itemId=prayer.id;
      notificationTitle="New prayer request in Held";
      notificationBody="Your spouse sent you a private prayer request.";
      notificationUrl="/#together/prayer/"+prayer.id;
    }
    if(!recipientId) return json({sent:0,message:"Spouse account is not linked"});

    if(checkinId||momentId||prayedRequestId||conversationRoundId||[7,14,21].includes(milestoneDay)){
      const {data:preference}=await supabase.from("user_preferences").select("quiet_until,reminders_paused").eq("user_id",recipientId).maybeSingle();
      const quietUntil=preference?.quiet_until?new Date(preference.quiet_until).getTime():0;
      if(preference?.reminders_paused&&quietUntil>Date.now()) return json({sent:0,quiet:true,message:"Spouse has quiet time enabled"});
    }

    const [{data:config,error:configError},{data:subscriptions,error:subscriptionError}]=await Promise.all([
      supabase.from("push_config").select("vapid_public_key,vapid_private_key").eq("id",true).single(),
      supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",recipientId)
    ]);
    if(configError) throw configError;
    if(subscriptionError) throw subscriptionError;
    if(!subscriptions?.length) return json({sent:0,message:"Spouse has not enabled device push yet"});

    webpush.setVapidDetails(
      "mailto:held-notifications@example.com",
      config.vapid_public_key,
      config.vapid_private_key
    );

    const payload=JSON.stringify({
      title:notificationTitle,
      body:notificationBody,
      url:notificationUrl,
      requestId:itemId
    });

    let sent=0;
    const expired:string[]=[];
    const results=await Promise.allSettled(subscriptions.map(async subscription=>{
      try{
        const pushSubscription={
          endpoint:subscription.endpoint,
          keys:{p256dh:subscription.p256dh,auth:subscription.auth}
        };
        try{
          await webpush.sendNotification(pushSubscription,payload,{TTL:3600,urgency:"high"});
        }catch(firstError){
          const firstStatus=(firstError as {statusCode?:number}).statusCode;
          if(firstStatus===404||firstStatus===410) throw firstError;
          await new Promise(resolve=>setTimeout(resolve,450));
          await webpush.sendNotification(pushSubscription,payload,{TTL:3600,urgency:"high"});
        }
        sent++;
      }catch(error){
        const status=(error as {statusCode?:number}).statusCode;
        if(status===404||status===410) expired.push(subscription.id);
        throw error;
      }
    }));

    if(expired.length) await supabase.from("push_subscriptions").delete().in("id",expired);
    const failed=results.length-sent;
    return json({sent,failed,revealed:conversationRoundId?conversationRevealed:undefined});
  }catch(error){
    console.error("Held push error",error);
    return json({error:error instanceof Error?error.message:"Push failed"},500);
  }
});