//导入和初始化
import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;     //设置端口号


//设置中间件和静态文件服务
app.use(express.json());  //用于解析json格式
app.use(express.static(path.join(__dirname, '..', 'public'))); //提供静态文件服务，将 public 文件夹下的文件作为静态资源。

// 处理根路径的GET请求。设置默认路由为登录页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// 处理登录请求：根据用户身份读取相应的数据文件，验证用户凭据，并返回适当的响应。
app.post('/login', async (req, res) => {
    const { identity, account, password } = req.body;
    const fileName = path.join(__dirname, '..', 'data', `${identity}Data.json`);

    try {
        console.log(`正在读取文件: ${fileName}`);
        const fileContent = await fs.readFile(fileName, 'utf8');
        const data = JSON.parse(fileContent);
        const user = data.find(u => u.account === account && u.password === password);

        if (user) {
            res.status(200).json({
                message: '登录成功',
                redirectTo: identity === 'student' ? '/student-dashboard.html' : '/teacher-dashboard.html',
                userId: user.account
            });
        } else {
            res.status(401).json({ message: '账号或密码错误' });
        }
    } catch (error) {
        console.error('登录过程中发生错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});


// 处理注册请求：它检查账号是否已存在，如果不存在则添加新用户到相应的数据文件中。
app.post('/register', async (req, res) => {
    const { identity, account, password } = req.body;
    const fileName = path.join(__dirname, '..', 'data', `${identity}Data.json`);

    try {
        // 读取现有数据
        let data = [];
        try {
            const fileContent = await fs.readFile(fileName, 'utf8');
            data = JSON.parse(fileContent);
        } catch (error) {
            // 文件不存在或为空，使用空数组
        }

        // 检查账号是否已存在
        if (data.some(user => user.account === account)) {
            return res.status(400).json({ message: '账号已存在' });
        }

        // 添加新用户
        data.push({ account, password });

        console.log(`正在写入文件: ${fileName}`);

        // 将更新后的数据写回文件
        await fs.writeFile(fileName, JSON.stringify(data, null, 2));

        res.status(200).json({ message: '注册成功' });
    } catch (error) {
        console.error('注册过程中发生错误:', error);
        res.status(500).json({ message: `服务器内部错误: ${error.message}` });
    }
});


// 获取请假记录：根据用户类型和状态过滤记录，并返回相应的数据。
app.get('/api/leave-requests', async (req, res) => {
    try {
        const recordsPath = path.join(__dirname, '..', 'data', 'record.json');
        const records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));

        const userId = req.query.userId;
        const userType = req.query.userType;

        let filteredRecords;
        if (userType === 'student') {
            filteredRecords = records.filter(record => record['student-id'] === userId);
        } else if (userType === 'teacher') {
            filteredRecords = records.filter(record => record['teacher-id'] === userId);
        } else {
            filteredRecords = records;
        }

        if (req.query.status === 'pending') {
            filteredRecords = filteredRecords.filter(record => record.status === '待审批');
        }

        res.json(filteredRecords);
    } catch (error) {
        console.error('获取请假记录时发生错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 提交新的请假申请：验证日期，创建新记录，并将其添加到记录文件中。
app.post('/api/leave-requests', async (req, res) => {
    try {
        const { 'start-date': startDate, 'end-date': endDate } = req.body;

        // 验证开始时间是否早于结束时间
        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(400).json({ message: '请假开始时间必须早于结束时间' });
        }

        const recordsPath = path.join(__dirname, '..', 'data', 'record.json');
        let records = [];
        try {
            records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
        } catch (error) {
            // 如果文件不存在或为空，使用空数组
        }

        const newRecord = {
            id: Date.now().toString(),
            submitTime: new Date().toISOString(),
            ...req.body,
            status: '待审批'
        };

        records.push(newRecord);
        await fs.writeFile(recordsPath, JSON.stringify(records, null, 2));

        res.status(201).json(newRecord);
    } catch (error) {
        console.error('提交请假申请时发生错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 获取单个请假申请详情
app.get('/api/leave-requests/:id', async (req, res) => {
    try {
        const recordsPath = path.join(__dirname, '..', 'data', 'record.json');
        const records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));

        const record = records.find(r => r.id === req.params.id);

        if (record) {
            res.json(record);
        } else {
            res.status(404).json({ message: '未找到请假申请' });
        }
    } catch (error) {
        console.error('获取请假申请详情时发生错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 处理请假申请审批：更新指定申请的状态，并保存更改。
app.post('/api/leave-requests/:id/approve', async (req, res) => {
    try {
        const recordsPath = path.join(__dirname, '..', 'data', 'record.json');
        let records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));

        const recordIndex = records.findIndex(r => r.id === req.params.id);

        if (recordIndex !== -1) {
            records[recordIndex].status = req.body.approved ? '已批准' : '未通过';
            await fs.writeFile(recordsPath, JSON.stringify(records, null, 2));
            res.json(records[recordIndex]);
        } else {
            res.status(404).json({ message: '未找到请假申请' });
        }
    } catch (error) {
        console.error('处理请假申请审批时发生错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});


//启动服务器:并在控制台输出服务器地址
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    console.log(`点击这里打开登录页面: http://localhost:${port}`);
});

