using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Web.Script.Serialization;
public class CaptureFixture {
 [STAThread] public static void Main(string[] args){
  var target=new Form { Text="AgentDemo capture test target",StartPosition=FormStartPosition.Manual,Location=new Point(120,120),Size=new Size(360,260),BackColor=Color.FromArgb(220,30,40)};
  var cover=new Form { Text="AgentDemo capture test occluder",StartPosition=FormStartPosition.Manual,Location=new Point(120,120),Size=new Size(360,260),BackColor=Color.FromArgb(30,70,220)};
  var timer=new Timer {Interval=400};int ticks=0;
  target.Shown+=(s,e)=>{cover.Show();cover.BringToFront();timer.Start();};
  timer.Tick+=(s,e)=>{
   if(++ticks==3){
    var b=new Bitmap(1,1);using(var g=Graphics.FromImage(b)){g.CopyFromScreen(280,240,0,0,new Size(1,1));}
    var pixel=b.GetPixel(0,0);b.Dispose();
    File.WriteAllText(args[0],new JavaScriptSerializer().Serialize(new {target=target.Handle.ToInt64().ToString(),cover=cover.Handle.ToInt64().ToString(),visible=new[]{pixel.R,pixel.G,pixel.B}}));
   }
   if(File.Exists(args[1])){target.WindowState=FormWindowState.Minimized;File.WriteAllText(args[1]+".ready","ready");}
  };
  Application.Run(target);cover.Dispose();timer.Dispose();
 }
}
