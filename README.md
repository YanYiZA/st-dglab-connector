DG-Lab Connector for SillyTavern

本插件为 SillyTavern 的第三方扩展组件，旨在建立大型语言模型（LLM）文本输出与 DG-Lab 郊狼（Coyote）电击设备之间的通信链路，实现基于指令标签的硬件自动化控制。

1. 核心概述

DG-Lab Connector 通过监听 SillyTavern 的消息流，解析特定格式的文本指令并将其转换为硬件可执行的强度信号。插件核心设计目标是提供一个安全、可控且延迟极低的硬件交互接口。

2. 运行逻辑

插件的运行周期分为以下四个技术：

文本监听 (Monitoring)：实时扫描 AI 生成的最新内容，开启流式输出时会在完全生成完成后才解析指令。

指令解析 (Parsing)：通过正则表达式（Regex）提取符合 [DG:X:Y] 规范的控制序列。

线性映射 (Mapping)：将指令中的百分比数值（0-100%）通过线性映射至用户定义的物理强度区间（Max Strength）。

通信分发 (Execution)：利用 HTTP 协议将计算后的强度与频率参数发送至本地运行的 DG-Lab Hub API 服务。