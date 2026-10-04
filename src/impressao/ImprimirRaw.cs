// Envia bytes "crus" (ESC/POS, ZPL, EPL) para uma impressora do Windows, sem passar pelo
// driver gráfico — assim o cupom e a etiqueta saem exatamente como foram montados.
//
//   ImprimirRaw.exe listar
//   ImprimirRaw.exe enviar "<nome da impressora>" "<arquivo>"
//
// Compilado automaticamente pelo servidor com o csc.exe do .NET Framework (já vem no Windows).
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class ImprimirRaw
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PRINTER_INFO_4
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pPrinterName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pServerName;
        public uint Attributes;
    }

    const uint PRINTER_ENUM_LOCAL = 0x2;
    const uint PRINTER_ENUM_CONNECTIONS = 0x4;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool EnumPrinters(uint flags, string name, uint level, IntPtr buf, uint cbBuf, out uint needed, out uint returned);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr handle, byte[] buf, int len, out int written);

    static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length >= 1 && args[0] == "listar") { Listar(); return 0; }
            if (args.Length >= 3 && args[0] == "enviar") { Enviar(args[1], File.ReadAllBytes(args[2])); return 0; }
            Console.Error.WriteLine("uso: ImprimirRaw listar | enviar <impressora> <arquivo>");
            return 2;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e.Message);
            return 1;
        }
    }

    static void Listar()
    {
        uint flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        uint needed, returned;
        EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out needed, out returned);
        if (needed == 0) return;
        IntPtr buf = Marshal.AllocHGlobal((int)needed);
        try
        {
            if (!EnumPrinters(flags, null, 4, buf, needed, out needed, out returned))
                throw new Exception("Não foi possível listar as impressoras (erro " + Marshal.GetLastWin32Error() + ").");
            int tam = Marshal.SizeOf(typeof(PRINTER_INFO_4));
            for (int i = 0; i < returned; i++)
            {
                var info = (PRINTER_INFO_4)Marshal.PtrToStructure(new IntPtr(buf.ToInt64() + i * tam), typeof(PRINTER_INFO_4));
                Console.WriteLine(info.pPrinterName);
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    static void Enviar(string impressora, byte[] dados)
    {
        IntPtr h;
        if (!OpenPrinter(impressora, out h, IntPtr.Zero))
            throw new Exception("Impressora não encontrada: \"" + impressora + "\" (erro " + Marshal.GetLastWin32Error() + ").");
        try
        {
            var di = new DOCINFO { pDocName = "Clara Styllus PDV", pDataType = "RAW" };
            if (StartDocPrinter(h, 1, di) == 0)
                throw new Exception("A impressora recusou o trabalho (erro " + Marshal.GetLastWin32Error() + ").");
            try
            {
                StartPagePrinter(h);
                int escritos;
                if (!WritePrinter(h, dados, dados.Length, out escritos) || escritos != dados.Length)
                    throw new Exception("Falha ao enviar para a impressora (erro " + Marshal.GetLastWin32Error() + ").");
                EndPagePrinter(h);
            }
            finally { EndDocPrinter(h); }
        }
        finally { ClosePrinter(h); }
    }
}
