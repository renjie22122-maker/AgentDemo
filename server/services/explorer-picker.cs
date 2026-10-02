using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class ExplorerFolderPicker {
 [ComImport, Guid("D57C7288-D4AD-4768-BE02-9D969532D960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface Dialog {
  [PreserveSig] int Show(IntPtr owner);
  void SetFileTypes(uint n,IntPtr types); void SetFileTypeIndex(uint n); void GetFileTypeIndex(out uint n);
  void Advise(IntPtr events,out uint cookie); void Unadvise(uint cookie);
  void SetOptions(uint flags); void GetOptions(out uint flags);
  void SetDefaultFolder(IntPtr item); void SetFolder(IntPtr item); void GetFolder(out IntPtr item);
  void GetCurrentSelection(out IntPtr item);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
  void GetFileName(out IntPtr name);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void GetResult(out IntPtr item); void AddPlace(IntPtr item,uint placement);
  void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
  void Close(int hr); void SetClientGuid(ref Guid guid); void ClearClientData(); void SetFilter(IntPtr filter);
  void GetResults(out Items items); void GetSelectedItems(out Items items);
 }
 [ComImport,Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface Items {
  void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,out IntPtr result);
  void GetPropertyStore(uint flags,ref Guid iid,out IntPtr result);
  void GetPropertyDescriptionList(IntPtr key,ref Guid iid,out IntPtr result);
  void GetAttributes(uint flags,uint mask,out uint attributes);
  void GetCount(out uint count); void GetItemAt(uint index,out Item item); void EnumItems(out IntPtr items);
 }
 [ComImport,Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface Item {
  void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,out IntPtr result);
  void GetParent(out Item parent); void GetDisplayName(uint kind,out IntPtr name);
  void GetAttributes(uint mask,out uint attributes); void Compare(Item other,uint hint,out int order);
 }
 const uint Flags=0x20|0x40|0x200|0x800|0x8|0x2000000;
 static Dialog Create() {
  var d=(Dialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
  try { d.SetOptions(Flags); d.SetTitle("Select project folders"); return d; }
  catch { Marshal.ReleaseComObject(d); throw; }
 }
 public static void Verify() {
  var d=Create();
  try { uint flags; d.GetOptions(out flags); if((flags&Flags)!=Flags)throw new Exception("Explorer picker options rejected."); }
  finally { Marshal.ReleaseComObject(d); }
 }
 public static string[] Select(IntPtr owner) {
  var d=Create();
  try {
   int hr=d.Show(owner);
   if(hr==unchecked((int)0x800704C7))return new string[0];
   if(hr<0)Marshal.ThrowExceptionForHR(hr);
   Items items;d.GetResults(out items);
   try {
    uint count;items.GetCount(out count);
    if(count>12)throw new Exception("Select at most 12 folders.");
    var paths=new List<string>();
    for(uint i=0;i<count;i++){
     Item item;items.GetItemAt(i,out item);
     try { IntPtr text;item.GetDisplayName(0x80058000,out text);try{paths.Add(Marshal.PtrToStringUni(text));}finally{Marshal.FreeCoTaskMem(text);} }
     finally { Marshal.ReleaseComObject(item); }
    }
    return paths.ToArray();
   } finally { Marshal.ReleaseComObject(items); }
  } finally { Marshal.ReleaseComObject(d); }
 }
}
